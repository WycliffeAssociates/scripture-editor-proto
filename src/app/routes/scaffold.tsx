import { Button, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import {
  createFileRoute,
  useLoaderData,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { processFile } from "@/app/domain/api/import.tsx";

export const Route = createFileRoute("/scaffold")({
  validateSearch: (
    search: Partial<Record<string, unknown>>,
  ): { url?: string } => {
    return { url: search.url as string | undefined };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  const router = useRouter();
  const invalidateRouterAndReload = () => router.invalidate();
  const { directoryProvider, projectRepository } = router.options.context;
  const { projects: initialProjects } = useLoaderData({ from: "__root__" });
  const [url, setUrl] = useState(search.url || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const processScaffold = async (targetUrl: string) => {
    setError("");
    setSuccessMessage("");
    setProgressMessage("Downloading scaffold ZIP...");
    setLoading(true);

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setProgressMessage("Processing scaffold ZIP...");
      const arrayBuffer = await response.arrayBuffer();
      const scaffoldFile = new File([arrayBuffer], "scaffold.zip", {
        type: "application/zip",
      });

      await processFile(scaffoldFile, {
        directoryProvider,
        invalidateRouterAndReload,
      });
      setSuccessMessage("Scaffold process completed successfully!");
      setProgressMessage("");
      debugger;
      const newProjects = await projectRepository.listProjects();
      const newProjectAdded = newProjects.find(
        (project) =>
          !initialProjects.find(
            (p) => p.projectDir.name === project.projectDir.name,
          ),
      );
      if (newProjectAdded) {
        router.navigate({
          to: `/$project`,
          params: { project: newProjectAdded.projectDir.name },
          replace: true,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
      setProgressMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processScaffold(url);
  };

  useEffect(() => {
    if (search.url) {
      setUrl(search.url);
      processScaffold(search.url);
    }
  }, [search.url]);

  const isLoading = loading;
  const showForm = !search.url || !isLoading;

  return (
    <Stack p="md" w="100%" h="100%">
      <Text size="xl" fw={500} mb="md">
        Scaffold from WACS URL
      </Text>

      {showForm ? (
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="WACS ZIP URL"
              placeholder="https://content.bibletranslationtools.org/WA-Catalog/en_ulb/src/branch/cro-release-v24.07"
              value={url}
              onChange={(e) => setUrl(e.currentTarget.value)}
              disabled={isLoading}
              size="md"
            />

            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}

            <Group justify="right">
              <Button
                type="submit"
                loading={isLoading}
                disabled={isLoading}
                size="md"
              >
                Scaffold Project
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <Stack gap="md">
          {progressMessage && (
            <Text c="blue" size="sm">
              {progressMessage}
            </Text>
          )}
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          {successMessage && (
            <Text c="green" size="sm">
              {successMessage}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
