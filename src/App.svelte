<script module lang="ts">
    const imageSize = 1500;

    export const sharedOptions = {
        showGroups: true,
    };
</script>

<script lang="ts">
    import Editor from "@/components/Editor.svelte";
    import languages from "@/languages";
    import Button from "@/components/Button.svelte";
    import Icon from "./components/Icon.svelte";
    import { onMount } from "svelte";
    import { toPng } from "html-to-image";
    import * as compiler from "@/compiler";
    import PrintView from "./components/PrintView.svelte";
    import Visualizer from "./components/Visualizer.svelte";
    import Examples from "./components/Examples.svelte";
    import { debounce } from "./util/debounce";
    import type { Example } from "./examples";
    import Modal from "./components/Modal.svelte";
    import Options from "./components/Options.svelte";
    import * as analytics from "./analytics";
    import LanguageDropdown from "./components/LanguageDropdown.svelte";
    import { parseEmbed } from "./embed";
    import { getViewportForBounds } from "@xyflow/svelte";

    let participantId = $state(localStorage.getItem("participantId"));

    $effect(() => {
        if (participantId != null) {
            localStorage.setItem("participantId", participantId);
        } else {
            localStorage.removeItem("participantId");
        }
    });

    const promptForParticipantId = () => {
        const id = prompt(
            "Enter your participant ID, or leave blank to clear:",
            participantId ?? "",
        )?.trim();

        if (id != null) {
            participantId = id;
        }
    };

    onMount(() => {
        analytics.sendEvent(participantId, { type: "sessionstart" });

        window.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                analytics.sendEvent(participantId, { type: "sessionend" });
            }
        });
    });

    let visualizer = $state<Visualizer>();
    let language = $state(Object.keys(languages)[0]);
    let code = $state("");
    let selections = $state<[number, number][]>([]);
    let errorMessage = $state("");
    let options = $state<Record<string, boolean>>(sharedOptions);
    let graphData = $state<compiler.CompilerOutput>();
    let selectedGroup = $state<compiler.Group>();
    let filter = $state<(node: compiler.Node) => boolean>(() => true);
    let embed = $state(false);

    const defaultOptions = $derived({ ...sharedOptions, ...languages[language].options });

    $effect(() => {
        options = defaultOptions;
    });

    const highlightedRanges = $derived.by(
        () =>
            selectedGroup?.nodes
                .values()
                .flatMap((node): [number, number][] =>
                    node.display !== "hidden"
                        ? [[node.span!.start.index, node.span!.end.index]]
                        : [],
                )
                .toArray() ?? [],
    );

    const stringifySelections = (selections: [number, number][]) =>
        selections.map(([start, end]) => `${start}-${end}`).join(",");

    const parseSelections = (string: string): [number, number][] => {
        if (string.length === 0) {
            return [];
        }

        return string.split(",").map((part) => part.split("-").map(parseFloat) as [number, number]);
    };

    const update = debounce(50, async () => {
        const url = new URL(window.location.href);
        url.searchParams.set("language", language);
        url.searchParams.set("code", code);
        url.searchParams.set("selections", stringifySelections(selections));
        url.searchParams.set("errorMessage", errorMessage);
        window.history.replaceState({}, "", url.toString());
    });

    $effect(() => {
        if (embed) return;

        language;
        code;
        selections;
        errorMessage;
        update();
    });

    let prevCodeState = "";
    const updateAnalytics = debounce(2500, () => {
        const codeState = { language, code, selections, errorMessage };
        const codeStateJson = JSON.stringify(codeState);

        if (codeStateJson === prevCodeState) return;
        prevCodeState = codeStateJson;

        analytics.sendEvent(participantId, { type: "code", ...codeState });
    });

    $effect(() => {
        if (embed) return;

        code;
        selectedGroup = undefined;
    });

    $effect(() => {
        if (embed) return;

        language;
        code;
        selections;
        errorMessage;
        updateAnalytics();
    });

    const saveImage = async () => {
        if (!visualizer) return;

        const nodesBounds = visualizer.getNodesBounds()!;
        const aspectRatio = nodesBounds.height / nodesBounds.width;
        const viewport = getViewportForBounds(
            nodesBounds,
            imageSize,
            imageSize * aspectRatio,
            -Infinity,
            Infinity,
            0.5,
        );

        const viewportElement = document.querySelector<HTMLElement>(".svelte-flow__viewport")!;

        const dataUrl = await toPng(viewportElement, {
            width: imageSize,
            height: imageSize * aspectRatio,
            style: {
                width: `${imageSize}px`,
                height: `${imageSize * aspectRatio}px`,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            },
        });

        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `typecircuits-${Date.now()}.png`;
        link.click();

        analytics.sendEvent(participantId, { type: "save" });
    };

    let printing = $state(false);

    $effect(() => {
        if (printing) {
            analytics.sendEvent(participantId, { type: "print" });
        }
    });

    let fullscreen = $state(false);
    onMount(() => {
        document.addEventListener("fullscreenchange", (e) => {
            fullscreen = document.fullscreenElement != null;
        });
    });

    $effect(() => {
        if (fullscreen) {
            analytics.sendEvent(participantId, { type: "project" });
        }
    });

    let showExamples = $state(false);

    const onclickexample = (example: Example) => {
        code = example.code;
        selections = example.selections ?? [];
        errorMessage = example.errorMessage ?? "";
        showExamples = false;
        options = { ...defaultOptions, ...example.options };

        analytics.sendEvent(participantId, { type: "example", example: example.title });
    };

    const oncloseexamples = () => {
        showExamples = false;
    };

    let showOptions = $state(false);

    const oncloseoptions = () => {
        showOptions = false;
    };

    $effect.pre(() => {
        const query = new URLSearchParams(window.location.search);

        if (query.has("embed")) {
            embed = true;
            fullscreen = true;

            window.addEventListener("message", (event) => {
                if (typeof event.data === "object" && "embed" in event.data) {
                    graphData = parseEmbed(event.data.embed);
                }
            });

            window.parent.postMessage("requestEmbed", "*");

            return;
        }

        if (query.has("fullscreen")) {
            fullscreen = true;
        }

        if (query.has("language")) language = query.get("language")!;
        if (query.has("code")) code = query.get("code")!;
        if (query.has("selections")) selections = parseSelections(query.get("selections")!);
    });

    const onclear = () => {
        if (code) {
            const confirmed = confirm("This will clear your current code. Are you sure?");
            if (!confirmed) return;
        }

        code = "";
        selections = [];
        errorMessage = "";
    };
</script>

<div
    class="flex h-screen w-screen flex-col"
    style:padding={fullscreen ? "4px" : "10px"}
    style:gap={fullscreen ? "0" : "10px"}
>
    <div class="flex flex-row items-center justify-between gap-[10px]">
        {#if !fullscreen}
            <div class="flex flex-row items-center gap-[10px] font-semibold">
                <a href="https://typecircuits.org" target="_blank">
                    <img
                        src="https://typecircuits.org/logo.png"
                        alt="Type Circuits"
                        class="size-[32px]"
                    />
                </a>

                <LanguageDropdown bind:selection={language} />

                <Button onclick={() => (showOptions = true)}>
                    <Icon>more_horiz</Icon>
                </Button>
            </div>
        {/if}

        {#if !fullscreen || errorMessage}
            <input
                type="text"
                placeholder="error message"
                bind:value={errorMessage}
                class="h-full flex-1 rounded-[10px] text-center font-mono text-sm not-placeholder-shown:border-transparent not-placeholder-shown:bg-red-50 not-placeholder-shown:text-red-500 placeholder-shown:border-black/5"
                style:font-size={fullscreen ? "20pt" : undefined}
                style:border-width={fullscreen ? undefined : "1.5px"}
            />
        {/if}

        {#if !fullscreen}
            <div class="flex flex-row items-center gap-[10px]">
                {#if visualizer != null}
                    {@const active = graphData != null && graphData.nodes.length > 0}

                    <div
                        class="flex flex-row items-center gap-[10px]"
                        style:pointer-events={active ? "auto" : "none"}
                        style:opacity={active ? "1" : "0.5"}
                    >
                        <Button onclick={saveImage}>
                            <Icon>download</Icon>
                            Save
                        </Button>

                        <Button onclick={() => (printing = true)}>
                            <Icon>print</Icon>
                            Print
                        </Button>
                    </div>
                {/if}

                <Button onclick={() => document.body.requestFullscreen()}>
                    <Icon>tv</Icon>
                    Project
                </Button>

                {#if import.meta.env.VITE_RESEARCH_ENABLED}
                    <Button
                        onclick={promptForParticipantId}
                        data-participant-id={participantId || undefined}
                        class="data-[participant-id]:bg-blue-50 data-[participant-id]:text-blue-500"
                    >
                        <Icon>school</Icon>
                        Research
                    </Button>
                {/if}
            </div>
        {/if}
    </div>

    <div
        class="relative flex min-h-0 flex-1 flex-col lg:flex-row"
        style:gap={fullscreen ? "0" : "10px"}
    >
        {#if !fullscreen}
            <div
                class={[
                    "flex flex-1 resize-none border-black/5 font-mono focus:outline-blue-500 lg:max-w-[500px]",
                    fullscreen ? "" : "rounded-lg border-[1.5px]",
                ]}
            >
                <Editor
                    {language}
                    bind:code
                    bind:selections
                    {highlightedRanges}
                    {fullscreen}
                    onshowexamples={() => (showExamples = true)}
                />
            </div>
        {/if}

        <div class={["flex-2 border-black/5", fullscreen ? "" : "rounded-lg border-[1.5px]"]}>
            <Visualizer
                bind:this={visualizer}
                {language}
                {embed}
                {code}
                {options}
                bind:selections
                bind:graphData
                bind:selectedGroup
                bind:filter
            />
        </div>
    </div>
</div>

{#if graphData != null && printing}
    <PrintView
        {code}
        {errorMessage}
        nodes={graphData.groups.nodes().filter(filter).toArray()}
        onfinish={() => (printing = false)}
    />
{/if}

{#if showExamples}
    <Modal width="800px" height="650px" onclose={oncloseexamples}>
        <Examples bind:language onclick={onclickexample} onclose={oncloseexamples} />
    </Modal>
{/if}

{#if showOptions}
    <Modal width="400px" height="auto" onclose={oncloseoptions}>
        <Options bind:options onclose={oncloseoptions} />
    </Modal>
{/if}
