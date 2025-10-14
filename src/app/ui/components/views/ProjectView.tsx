import {MainEditor} from "@/app/ui/components/blocks/Editor";
import {Toolbar} from "@/app/ui/components/blocks/Toolbar";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function ProjectView() {
  const {search} = useProjectContext();
  return (
    <div className="grid grid-rows-[auto_1fr] h-screen ">
      <nav>
        <Toolbar />
      </nav>
      <div className="flex h-full overflow-y-auto">
        {search.results.length > 0 && (
          <ul className="w-1/3 bg-gray-100 gap-2 flex flex-col max-h-[calc(100vh-5rem)] overflow-y-auto px-2">
            {search.results.map((result) => (
              <li
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    search.pickSearchResult(result);
                  }
                }}
                className="text-xs flex flex-col gap-1"
                key={result.sid}
                onClick={() => search.pickSearchResult(result)}
              >
                <span className="font-bold">{result.sid}</span>
                {result.text}
              </li>
            ))}
          </ul>
        )}
        <main className="h-full overflow-y-auto max-w-prose">
          <MainEditor />
        </main>
      </div>
    </div>
  );
}
