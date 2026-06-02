<script module lang="ts">
    const imageSize = 1500;

    export type Options = typeof defaultOptions;

    export const defaultOptions = {
        showGroups: true,
        showTypes: true,
        showFunctions: false,
    };

    export const selectionFilter = (selections: [number, number][]) => (node: compiler.Node) =>
        selections.length === 0 ||
        selections.some(
            ([from, to]) =>
                node.startIndex != null &&
                node.startIndex >= from &&
                node.endIndex != null &&
                node.endIndex <= to,
        );
</script>

<script lang="ts">
    import Editor from "@/components/Editor.svelte";
    import * as compiler from "@/compiler";
    import { embeddedLanguage, languages as languages } from "@/languages";
    import Button from "@/components/Button.svelte";
    import Icon from "./components/Icon.svelte";
    import { onMount } from "svelte";
    import { toCanvas } from "html-to-image";
    import PrintView, { type PrintOptions } from "./components/PrintView.svelte";
    import Visualizer from "./components/Visualizer.svelte";
    import Examples from "./components/Examples.svelte";
    import { debounce } from "./util/debounce";
    import type { Example } from "./examples";
    import Modal from "./components/Modal.svelte";
    import OptionsSelector from "./components/Options.svelte";
    import * as analytics from "./analytics";
    import LanguageDropdown from "./components/LanguageDropdown.svelte";
    import { getViewportForBounds } from "@xyflow/svelte";
    import Menu from "./components/Menu.svelte";
    import MenuButton from "./components/MenuButton.svelte";

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
    let language = $state<compiler.Language>();
    let code = $state("");
    let selections = $state<[number, number][]>([]);
    let errorMessage = $state("");
    let options = $state(defaultOptions);
    let selectedGroup = $state<compiler.Group>();
    let embed = $state(false);

    const resolvedLanguage = $derived(language?.init());

    let compileResult = $state<compiler.CompileResult>();

    $effect(() => {
        code;
        $state.snapshot(options); // react to each option
        resolvedLanguage?.then((language) => {
            compileResult = language.compile(code, options);
        });
    });

    const filter = $derived(selectionFilter(selections));

    const highlightedRanges = $derived.by(() => {
        if (compileResult == null || selectedGroup == null) {
            return [];
        }

        return (
            selectedGroup.nodes
                .values()
                .flatMap((node): [number, number][] =>
                    node.startIndex != null && node.endIndex != null
                        ? [[node.startIndex, node.endIndex]]
                        : [],
                )
                .toArray() ?? []
        );
    });

    const stringifySelections = (selections: [number, number][]) =>
        selections.map(([start, end]) => `${start}-${end}`).join(",");

    const parseSelections = (string: string): [number, number][] => {
        if (string.length === 0) {
            return [];
        }

        return string.split(",").map((part) => part.split("-").map(parseFloat) as [number, number]);
    };

    const update = debounce(50, async () => {
        if (language == null) return;

        const url = new URL(window.location.href);
        url.searchParams.set("language", language.name);
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
        const codeState = { language: language?.name, code, selections, errorMessage };
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

        const canvas = await toCanvas(viewportElement, {
            width: imageSize,
            height: imageSize * aspectRatio,
            style: {
                width: `${imageSize}px`,
                height: `${imageSize * aspectRatio}px`,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            },
        });

        // Crop canvas to content

        let minX = imageSize;
        let maxX = 0;
        let minY = imageSize * aspectRatio;
        let maxY = 0;
        const imageData = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < imageData.height; y++) {
            for (let x = 0; x < imageData.width; x++) {
                const index = (y * imageData.width + x) * 4;

                const alpha = imageData.data[index + 3];
                if (alpha === 0) {
                    continue;
                }

                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        const croppedCanvas = document.createElement("canvas");
        croppedCanvas.width = maxX - minX;
        croppedCanvas.height = maxY - minY;
        const ctx = croppedCanvas.getContext("2d")!;
        ctx.drawImage(
            canvas,
            minX,
            minY,
            croppedCanvas.width,
            croppedCanvas.height,
            0,
            0,
            croppedCanvas.width,
            croppedCanvas.height,
        );

        // Save as image

        const link = document.createElement("a");
        link.href = croppedCanvas.toDataURL();
        link.download = `typecircuits-${Date.now()}.png`;
        link.click();

        analytics.sendEvent(participantId, { type: "save" });
    };

    let printing = $state<PrintOptions>();

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

    onMount(() => {
        const query = new URLSearchParams(window.location.search);

        if (query.has("embed")) {
            embed = true;
            fullscreen = true;
            options.showFunctions = query.has("showFunctions");

            window.addEventListener("message", (event) => {
                if (typeof event.data === "object" && "embed" in event.data) {
                    language = embeddedLanguage("embed", event.data.embed);
                }
            });

            window.parent.postMessage("requestEmbed", "*");

            return;
        }

        if (query.has("fullscreen")) {
            fullscreen = true;
        }

        if (query.has("language")) {
            const name = query.get("language")!;
            language = languages.find((language) => language.name === name);
        }

        if (query.has("code")) {
            code = query.get("code")!;
        }

        if (query.has("selections")) {
            selections = parseSelections(query.get("selections")!);
        }

        if (language == null) {
            language = languages[0];
        }
    });

    const onscan = () => {
        if (compileResult == null) return;

        const nodes = compileResult.nodes.values().filter(filter).toArray();

        const cards = nodes.map((node) => node.toString());

        const groups = Iterator.from(compileResult.groups)
            .map((group) =>
                group.nodes
                    .values()
                    .filter(filter)
                    .map((node) => nodes.indexOf(node))
                    .toArray(),
            )
            .toArray();

        const data = { cards, groups };

        const url = new URL(import.meta.env.VITE_SCAN_URL);
        url.searchParams.set("data", JSON.stringify(data));
        window.open(url.toString(), "_blank");
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

                {#if language != null}
                    <LanguageDropdown bind:selection={language} />
                {/if}

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
                    {@const active = compileResult != null && compileResult.nodes.size > 0}

                    <div
                        class="flex flex-row items-center gap-[10px]"
                        style:pointer-events={active ? "auto" : "none"}
                        style:opacity={active ? "1" : "0.5"}
                    >
                        <Button onclick={saveImage}>
                            <Icon>download</Icon>
                            Save
                        </Button>

                        <Menu>
                            <Button>
                                <Icon>print</Icon>
                                Print
                            </Button>

                            {#snippet items()}
                                <MenuButton onclick={() => (printing = {})}>
                                    <Icon>draft</Icon>
                                    Standard
                                </MenuButton>

                                <MenuButton onclick={() => (printing = { trackers: true })}>
                                    <Icon>qr_code_scanner</Icon>
                                    With Trackers
                                </MenuButton>
                            {/snippet}
                        </Menu>

                        <Button onclick={onscan}>
                            <Icon>qr_code_scanner</Icon>
                            Scan
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
                {#if language}
                    <Editor
                        {language}
                        bind:code
                        bind:selections
                        {highlightedRanges}
                        {fullscreen}
                        onshowexamples={() => (showExamples = true)}
                    />
                {/if}
            </div>
        {/if}

        <div class={["flex-2 border-black/5", fullscreen ? "" : "rounded-lg border-[1.5px]"]}>
            <Visualizer
                bind:this={visualizer}
                {compileResult}
                {embed}
                {options}
                bind:selections
                bind:selectedGroup
            />
        </div>
    </div>
</div>

{#if compileResult != null && printing != null}
    <PrintView
        {code}
        {errorMessage}
        options={printing}
        nodes={compileResult.nodes.values().filter(filter).toArray()}
        onfinish={() => (printing = undefined)}
    />
{/if}

{#if showExamples && language != null}
    <Modal width="800px" height="650px" onclose={oncloseexamples}>
        <Examples
            bind:language
            {resolvedLanguage}
            onclick={onclickexample}
            onclose={oncloseexamples}
        />
    </Modal>
{/if}

{#if showOptions}
    <Modal width="400px" height="auto" onclose={oncloseoptions}>
        <OptionsSelector bind:options onclose={oncloseoptions} />
    </Modal>
{/if}
