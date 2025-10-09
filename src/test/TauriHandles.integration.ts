import {appLocalDataDir, join} from "@tauri-apps/api/path";
import {mkdir, remove} from "@tauri-apps/plugin-fs";
import {TauriFileHandle} from "../core/domain/persistence/TauriHandles"; // Assuming TauriHandles is in the same directory

const log = (message: string, isError: boolean = false) => {
  const color = isError ? "[31m[FAILURE][0m" : "[33m[INFO][0m";
  console.log(`${color} ${message}`);
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readFileContent = async (handle: TauriFileHandle): Promise<string> => {
  const file = await handle.getFile();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(file);
  });
};

/**
 * Runs a series of integration tests for the TauriFileHandle writable stream implementation.
 * It uses actual Tauri file system calls, so it must be run within a Tauri environment.
 */
export async function runIntegrationTests() {
  log("Starting Tauri File Handle Integration Tests...");
  const baseDir = await appLocalDataDir();
  const testDirPath = await join(baseDir, "tauri-file-handle-tests");
  const testFilePath = await join(testDirPath, "stream_test.txt");

  try {
    await mkdir(testDirPath, {recursive: true});
    await remove(testFilePath);
  } catch (e) {
    // If remove fails on non-existent file, that's fine.
    // If mkdir fails, we want to see the error.
    if (e instanceof Error && !/no such file|not found/i.test(e.message)) {
      throw e;
    }
  }

  // Ensure directory exists and clean up previous file
  const setupHandle = new TauriFileHandle(testFilePath);
  await setupHandle
    .createWritable({keepExistingData: true})
    .then((w) => w.close()); // Create file & directory

  log(`Using test file path: ${testFilePath}`);
  let passedTests = 0;
  const totalTests = 4; // Updated count

  const handle = new TauriFileHandle(testFilePath);

  // --- Test 1: Basic Write/Append (Uses keepExistingData: true) ---
  try {
    // Step 1: Write initial content
    let writer = await handle
      .createWritable({keepExistingData: true})
      .then((s) => s.getWriter());
    await writer.write("Hello, World!");
    await writer.close();

    let content = await readFileContent(handle);
    assert(
      content === "Hello, World!",
      `Expected 'Hello, World!', got '${content}'`
    );

    // Step 2: Re-open and append
    writer = await handle
      .createWritable({keepExistingData: true})
      .then((s) => s.getWriter());
    await writer.write(" Appended.");
    await writer.close();

    content = await readFileContent(handle);
    assert(
      content === "Hello, World! Appended.",
      `Expected 'Hello, World! Appended.', got '${content}'`
    );

    log("Test 1 Passed: Basic Write/Append (keepExistingData: true)");
    passedTests++;
  } catch (e) {
    log(`Test 1 Failed: Basic Write/Append. Error: ${e}`, true);
  }

  // --- Test 2: Stream Seek/Write (Uses keepExistingData: true) ---
  try {
    // Set file content to 'The quick brown fox jumps over the lazy dog.'
    let stream = await handle.createWritable({keepExistingData: false}); // Truncate for fresh start
    await stream.write("The quick brown fox jumps over the lazy dog.");
    await stream.close();

    // Overwrite 'brown' with 'RED'
    stream = await handle.createWritable({keepExistingData: true});

    // "The quick ".length is 10
    await stream.seek(10);
    await stream.write("RED  ");
    await stream.close();

    const expected = "The quick RED   fox jumps over the lazy dog.";
    const actual = await readFileContent(handle);
    assert(
      actual === expected,
      `Expected positioned write to result in '${expected}', got '${actual}'`
    );

    log("Test 2 Passed: Stream Seek/Write (keepExistingData: true)");
    passedTests++;
  } catch (e) {
    log(`Test 2 Failed: Stream Seek/Write. Error: ${e}`, true);
  }

  // --- Test 3: Truncate and Mixed Ops (Uses keepExistingData: true) ---
  try {
    // Set file content to '0123456789ABCDEF'
    let stream = await handle.createWritable({keepExistingData: false}); // Truncate for fresh start
    await stream.write("0123456789ABCDEF");
    await stream.close();

    // Re-open and truncate to 10 bytes (should leave '0123456789')
    stream = await handle.createWritable({keepExistingData: true});
    await stream.truncate(10);
    await stream.close();

    let actual = await readFileContent(handle);
    let expected = "0123456789";
    assert(
      actual === expected,
      `Expected truncate(10) to be '${expected}', got '${actual}'`
    );

    // Re-open and seek/append
    stream = await handle.createWritable({keepExistingData: true});
    await stream.seek(expected.length); // seek to 10
    await stream.write("Z");
    await stream.close();

    actual = await readFileContent(handle);
    expected = "0123456789Z";
    assert(
      actual === expected,
      `Expected seek/append to be '${expected}', got '${actual}'`
    );

    log("Test 3 Passed: Truncate and Mixed Ops (keepExistingData: true)");
    passedTests++;
  } catch (e) {
    log(`Test 3 Failed: Truncate and Mixed Ops. Error: ${e}`, true);
  }

  // --- Test 4: Default Truncation Test (Uses keepExistingData: false / default) ---
  try {
    // Set file content to 'OLD DATA'
    let stream = await handle.createWritable({keepExistingData: false});
    await stream.write("OLD DATA");
    await stream.close();

    // Re-open with default options (which should truncate the file)
    let writer = await handle.createWritable().then((s) => s.getWriter()); // Note: No options passed
    await writer.write("NEW");
    await writer.close();

    const actual = await readFileContent(handle);
    const expected = "NEW";
    assert(
      actual === expected,
      `Expected default open to truncate and result in '${expected}', got '${actual}'`
    );

    log("Test 4 Passed: Default Truncation (keepExistingData: false)");
    passedTests++;
  } catch (e) {
    log(`Test 4 Failed: Default Truncation. Error: ${e}`, true);
  }

  log("");
  log(
    `${passedTests} of ${totalTests} Writable Stream Integration Tests Passed.`
  );
}
