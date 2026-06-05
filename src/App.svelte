<script module lang="ts">
    const imageSize = 1500;

    export type Show = typeof defaultShow;

    export const defaultShow = {
        groups: true,
        types: true,
        functions: false,
    };

    export const selectionFilter =
        (selections: [number, number][], hiddenNodes: string[]) => (node: compiler.Node) =>
            !hiddenNodes.includes(node.id) &&
            (selections.length === 0 ||
                selections.some(
                    ([from, to]) =>
                        node.startIndex != null &&
                        node.startIndex >= from &&
                        node.endIndex != null &&
                        node.endIndex <= to,
                ));

    const stringifySelections = (selections: [number, number][]) =>
        selections.map(([start, end]) => `${start}-${end}`).join(",");

    const parseSelections = (string: string): [number, number][] => {
        if (string.length === 0) {
            return [];
        }

        return string.split(",").map((part) => part.split("-").map(parseFloat) as [number, number]);
    };
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
    import LanguageDropdown from "./components/LanguageDropdown.svelte";
    import { getViewportForBounds } from "@xyflow/svelte";
    import Menu from "./components/Menu.svelte";
    import MenuButton from "./components/MenuButton.svelte";

    const query = $state(
        (() => {
            const result = {
                embed: false,
                fullscreen: false,
                preview: false,
                debug: false,
                language: undefined as compiler.Language | undefined,
                code: "",
                errorMessage: "",
                selections: [] as [number, number][],
                hiddenNodes: [] as string[],
                show: defaultShow,
            };

            const query = new URLSearchParams(window.location.search);

            if (query.has("embed")) {
                result.embed = true;
                result.fullscreen = true;

                let setShow = false;
                window.addEventListener("message", (event) => {
                    if (typeof event.data === "object" && "embed" in event.data) {
                        result.language = embeddedLanguage("embed", event.data.embed);

                        if (!setShow) {
                            Object.assign(result.show, event.data.show);
                            setShow = true;
                        }
                    }
                });

                window.parent.postMessage("requestEmbed", "*");

                return result;
            }

            if (query.has("preview")) {
                result.preview = true;
            }

            if (query.has("debug")) {
                result.debug = true;
            }

            if (query.has("fullscreen")) {
                result.fullscreen = true;
            }

            if (query.has("language")) {
                const name = query.get("language")!;
                result.language = languages.find((language) => language.name === name);
            }

            result.language ??= languages[0];

            if (query.has("code")) {
                result.code = query.get("code")!;
            }

            if (query.has("selections")) {
                result.selections = parseSelections(query.get("selections")!);
            }

            if (query.has("hidden")) {
                result.hiddenNodes = query.get("hidden")!.split(",");
            }

            if (query.has("errorMessage")) {
                result.errorMessage = query.get("errorMessage")!;
            }

            if (query.has("show")) {
                for (const key in defaultShow) {
                    result.show[key as keyof Show] = false;
                }

                for (const entry of query.get("show")!.split(",")) {
                    if (entry in result.show) {
                        result.show[entry as keyof Show] = true;
                    }
                }
            }

            return result;
        })(),
    );

    let visualizer = $state<Visualizer>();
    let selectedGroup = $state<compiler.Group>();

    const resolvedLanguage = $derived(query.language?.init());

    let compileResult = $state<compiler.CompileResult>();

    $effect(() => {
        query.code;
        $state.snapshot(query.show); // react to each option

        resolvedLanguage?.then((language) => {
            compileResult = language.compile(query.code, query.show);
        });
    });

    const filter = $derived(selectionFilter(query.selections, query.hiddenNodes));

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

    const update = debounce(50, async () => {
        if (query.language == null) return;

        const url = new URL(window.location.href);

        if (query.debug) url.searchParams.set("debug", "1");

        url.searchParams.set("language", query.language.name);

        url.searchParams.set("code", query.code);

        url.searchParams.set("errorMessage", query.errorMessage);

        url.searchParams.set("selections", stringifySelections(query.selections));

        url.searchParams.set("hidden", query.hiddenNodes.join(","));

        url.searchParams.set(
            "show",
            Object.entries(query.show)
                .filter(([_, enabled]) => enabled)
                .map(([key]) => key)
                .join(","),
        );

        window.history.replaceState({}, "", url.toString());
    });

    $effect(() => {
        if (query.embed) return;

        query.language;
        query.code;
        query.errorMessage;
        $state.snapshot(query.selections);
        $state.snapshot(query.hiddenNodes);
        $state.snapshot(query.show);

        update();
    });

    let prevCode = query.code;
    $effect(() => {
        if (query.embed || query.code === prevCode) return;

        selectedGroup = undefined;
        query.hiddenNodes = [];

        prevCode = query.code;
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
    };

    let printing = $state<PrintOptions>();

    onMount(() => {
        document.addEventListener("fullscreenchange", (e) => {
            query.fullscreen = document.fullscreenElement != null;
        });
    });

    let showExamples = $state(false);

    const onclickexample = (example: Example) => {
        query.code = example.code;
        query.selections = example.selections ?? [];
        query.errorMessage = example.errorMessage ?? "";
        showExamples = false;
        query.show = { ...defaultShow, ...example.show };
    };

    const oncloseexamples = () => {
        showExamples = false;
    };

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
    style:padding={query.fullscreen ? "4px" : "10px"}
    style:gap={query.fullscreen ? "0" : "10px"}
>
    <div class="flex flex-row items-center justify-between gap-[10px]">
        {#if !query.fullscreen}
            <div class="flex flex-row items-center gap-[10px] font-semibold">
                {#if query.language != null}
                    <LanguageDropdown bind:selection={query.language} />
                {/if}
            </div>
        {/if}

        {#if !query.fullscreen || query.errorMessage}
            <input
                type="text"
                placeholder="error message"
                bind:value={query.errorMessage}
                class="h-full flex-1 rounded-[10px] text-center font-mono text-sm not-placeholder-shown:border-transparent not-placeholder-shown:bg-red-50 not-placeholder-shown:text-red-500 placeholder-shown:border-black/5"
                style:font-size={query.fullscreen ? "20pt" : undefined}
                style:border-width={query.fullscreen ? undefined : "1.5px"}
            />
        {/if}

        {#if !query.fullscreen}
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
            </div>
        {/if}
    </div>

    <div
        class="relative flex min-h-0 flex-1 flex-col lg:flex-row"
        style:gap={query.fullscreen ? "0" : "10px"}
    >
        {#if !query.fullscreen}
            <div
                class={[
                    "flex flex-1 resize-none border-black/5 font-mono focus:outline-blue-500 lg:max-w-[500px]",
                    query.fullscreen ? "" : "rounded-lg border-[1.5px]",
                ]}
            >
                {#if query.language}
                    <Editor
                        language={query.language}
                        bind:code={query.code}
                        bind:selections={query.selections}
                        {highlightedRanges}
                        fullscreen={query.fullscreen}
                        onshowexamples={() => (showExamples = true)}
                    />
                {/if}
            </div>
        {/if}

        <div
            class={[
                "flex flex-2 flex-col border-black/5",
                query.fullscreen ? "" : "rounded-lg border-[1.5px]",
            ]}
        >
            {#if query.debug}
                <div class="flex-1 border-b-[1.5px] border-black/5 p-4">
                    {#if compileResult?.root != null}
                        <pre>{compiler.debugTree(compileResult.root)}</pre>
                    {/if}
                </div>
            {/if}

            <div class="flex-1">
                <Visualizer
                    bind:this={visualizer}
                    {compileResult}
                    preview={query.preview}
                    bind:show={query.show}
                    bind:selections={query.selections}
                    bind:hiddenNodes={query.hiddenNodes}
                    bind:selectedGroup
                />
            </div>
        </div>
    </div>
</div>

{#if compileResult != null && printing != null}
    <PrintView
        code={query.code}
        errorMessage={query.errorMessage}
        options={printing}
        nodes={compileResult.nodes.values().filter(filter).toArray()}
        onfinish={() => (printing = undefined)}
    />
{/if}

{#if showExamples && query.language != null}
    <Modal width="800px" height="650px" onclose={oncloseexamples}>
        <Examples
            bind:language={query.language}
            {resolvedLanguage}
            onclick={onclickexample}
            onclose={oncloseexamples}
        />
    </Modal>
{/if}
