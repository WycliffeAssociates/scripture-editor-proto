import { createFileRoute, useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import {Label} from "@radix-ui/react-label";
import {Input} from "@/ui/components/primitives/input.tsx";
import {Button} from "@/ui/components/primitives/button.tsx";

export const Route = createFileRoute("/projects/create")({
    component: RouteComponent,
});

function RouteComponent() {
    // https://content.bibletranslationtools.org/Tech_Advance/kng-x-kitandu_reg.git
    // https://content.bibletranslationtools.org/Will_Kelly/en_ulb.git
    const [url, setUrl] = useState<string>(
        "https://content.bibletranslationtools.org/Will_Kelly/en_ulb.git",
    );
    const routerCtx = useRouter().options.context;
    const [loading, setLoading] = useState(false);

    const handleClone = async () => {
        setLoading(true);
        try {
            const args = {
                url,
                path: `${routerCtx.dirs.projects}${routerCtx.pathSeparator}`,
            };
            const err = await invoke("clone_repo", args);
            if (err) {
                toast.error(err as string, {
                    duration: 5000,
                });
            } else {
                toast.success("Repository cloned successfully!", {
                    duration: 5000,
                    position: "top-right",
                });
            }
        } catch (error) {
            console.error("Error cloning repository:", error);
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="flex flex-col gap-2 items-start">
            <Label className="flex flex-col gap-2 items-start w-full">
                Repository URL
                <Input
                    className="w-144"
                    value={url}
                    placeholder="https://github.com/username/repo.git"
                    type="text"
                    onChange={(e) => setUrl(e.target.value)}
                />
            </Label>
            <Button onClick={handleClone} type="button" disabled={loading}>
                Clone
            </Button>
        </div>
    );
}
