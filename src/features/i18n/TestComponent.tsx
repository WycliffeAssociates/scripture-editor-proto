import {Trans} from "@lingui/react/macro";

export function TestComponent() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        <Trans>Welcome to USFM Editor</Trans>
      </h2>
      <p>
        <Trans>
          This is a test component to verify Lingui internationalization setup.
        </Trans>
      </p>
    </div>
  );
}
