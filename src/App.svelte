<script module lang="ts">
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
                selections.some(([from, to]) => node.pos.start >= from && node.pos.end <= to));

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
    import type * as compiler from "@/core/compiler";
    import { makeCompiler } from "@/core/compiler";
    import { allLanguages, embeddedLanguage, getLanguage, type Language } from "@/core/languages";
    import Button from "@/components/Button.svelte";
    import Icon from "./components/Icon.svelte";
    import { onMount } from "svelte";
    import PrintView from "./components/PrintView.svelte";
    import Examples from "./components/Examples.svelte";
    import { debounce } from "./util/debounce";
    import type { Example } from "./examples";
    import Modal from "./components/Modal.svelte";
    import Dropdown from "./components/Dropdown.svelte";
    import { allVisualizers, type VisualizerBindings } from "./visualizers";
    import { context, getFilteredNodes } from "./context.svelte";

    onMount(() => {
        const query = new URLSearchParams(window.location.search);

        if (query.has("embed")) {
            context.embed = true;
            context.fullscreen = true;
            return;
        }

        if (query.has("preview")) {
            context.preview = true;
        }

        if (query.has("fullscreen")) {
            context.fullscreen = true;
        }

        if (query.has("language")) {
            const name = query.get("language")!;
            context.language = getLanguage(name);
        }

        context.language ??= allLanguages[0];

        if (query.has("visualizer")) {
            const name = query.get("visualizer")!;
            context.visualizer = name;
        }

        context.visualizer ??= Object.keys(allVisualizers)[0];

        if (query.has("code")) {
            context.code = query.get("code")!;
        }

        if (query.has("selections")) {
            context.selections = parseSelections(query.get("selections")!);
        }

        if (query.has("hidden")) {
            context.hiddenNodes = query.get("hidden")!.split(",");
        }

        if (query.has("errorMessage")) {
            context.errorMessage = query.get("errorMessage")!;
        }

        if (query.has("show")) {
            for (const key in defaultShow) {
                context.show[key as keyof Show] = false;
            }

            for (const entry of query.get("show")!.split(",")) {
                if (entry in context.show) {
                    context.show[entry as keyof Show] = true;
                }
            }
        }
    });

    $effect(() => {
        if (!context.embed) return;

        let setShow = false;
        window.addEventListener("message", (event) => {
            if (typeof event.data === "object" && "embed" in event.data) {
                context.language = embeddedLanguage;
                context.code = JSON.stringify(event.data.embed);

                if (!setShow) {
                    Object.assign(context.show, event.data.show);
                    setShow = true;
                }
            }
        });

        window.parent.postMessage("requestEmbed", "*");
    });

    let Visualizer = $derived(context.visualizer ? allVisualizers[context.visualizer] : undefined);
    let visualizer = $state<VisualizerBindings<any>>();
    let selectedGroup = $state<compiler.CompiledGroup>();

    const compile = debounce(250, async (language: Language<unknown>) => {
        const parsed = await language.parse(context.code);
        if (parsed == null) {
            context.compileResult = undefined;
            return;
        }

        const compiler = makeCompiler({ show: context.show });
        await language.compile(parsed, compiler);
        context.compileResult = compiler.finish();
    });

    $effect(() => {
        context.code;
        $state.snapshot(context.show); // react to each option
        if (context.language != null) {
            compile(context.language);
        }
    });

    const highlightedRanges = $derived.by(() => {
        if (context.compileResult == null || selectedGroup == null) {
            return [];
        }

        return (
            selectedGroup.nodes
                .values()
                .map((node): [number, number] => [node.pos.start, node.pos.end])
                .toArray() ?? []
        );
    });

    const update = debounce(250, async () => {
        if (context.language == null) return;

        const url = new URL(window.location.href);

        url.searchParams.set("language", context.language.name);

        if (context.visualizer != null) {
            url.searchParams.set("visualizer", context.visualizer);
        }

        url.searchParams.set("code", context.code);

        url.searchParams.set("errorMessage", context.errorMessage);

        url.searchParams.set("selections", stringifySelections(context.selections));

        url.searchParams.set("hidden", context.hiddenNodes.join(","));

        url.searchParams.set(
            "show",
            Object.entries(context.show)
                .filter(([_, enabled]) => enabled)
                .map(([key]) => key)
                .join(","),
        );

        window.history.replaceState({}, "", url.toString());
    });

    $effect(() => {
        if (context.embed) return;

        context.language;
        context.visualizer;
        context.code;
        context.errorMessage;
        $state.snapshot(context.selections);
        $state.snapshot(context.hiddenNodes);
        $state.snapshot(context.show);

        update();
    });

    let prevCode = context.code;
    $effect(() => {
        if (context.embed || context.code === prevCode) return;

        selectedGroup = undefined;
        context.hiddenNodes = [];

        prevCode = context.code;
    });

    onMount(() => {
        document.addEventListener("fullscreenchange", (e) => {
            context.fullscreen = document.fullscreenElement != null;
        });
    });

    let showExamples = $state(false);

    const onclickexample = (example: Example) => {
        context.code = example.code;
        context.selections = example.selections ?? [];
        context.errorMessage = example.errorMessage ?? "";
        showExamples = false;
        context.show = { ...defaultShow, ...example.show };
    };

    const oncloseexamples = () => {
        showExamples = false;
    };

    let filteredNodes = $derived(getFilteredNodes());
</script>

{#if filteredNodes != null && context.printing != null}
    <PrintView
        errorMessage={context.errorMessage}
        options={context.printing}
        nodes={filteredNodes}
        onfinish={() => (context.printing = undefined)}
    />
{:else}
    <div
        class="flex h-screen w-screen flex-col"
        style:padding={context.fullscreen ? "4px" : "10px"}
        style:gap={context.fullscreen ? "0" : "10px"}
    >
        <div class="flex flex-row items-center justify-between gap-[10px]">
            {#if !context.fullscreen}
                <div class="flex flex-row items-center gap-[10px] font-semibold">
                    {#if context.language != null}
                        <Dropdown
                            options={allLanguages}
                            optionName={(language) => language.name}
                            bind:selection={context.language}
                        />
                    {/if}

                    {#if context.visualizer != null}
                        <Dropdown
                            options={Object.keys(allVisualizers)}
                            optionName={(key) => key}
                            bind:selection={context.visualizer}
                        />
                    {/if}
                </div>
            {/if}

            {#if !context.fullscreen || context.errorMessage}
                <input
                    type="text"
                    placeholder="error message"
                    bind:value={context.errorMessage}
                    class="h-full flex-1 rounded-[10px] text-center font-mono text-sm not-placeholder-shown:border-transparent not-placeholder-shown:bg-red-50 not-placeholder-shown:text-red-500 placeholder-shown:border-black/5"
                    style:font-size={context.fullscreen ? "20pt" : undefined}
                    style:border-width={context.fullscreen ? undefined : "1.5px"}
                />
            {/if}

            {#if !context.fullscreen}
                <div class="flex flex-row items-center gap-[10px]">
                    {#if visualizer?.toolbar != null && visualizer.toolbarProps != null}
                        {@const active = filteredNodes != null && filteredNodes.length > 0}

                        <div
                            class="flex flex-row items-center gap-[10px]"
                            style:pointer-events={active ? "auto" : "none"}
                            style:opacity={active ? "1" : "0.5"}
                        >
                            <visualizer.toolbar {...visualizer.toolbarProps} />
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
            style:gap={context.fullscreen ? "0" : "10px"}
        >
            {#if !context.fullscreen}
                <div
                    class={[
                        "flex flex-1 resize-none border-black/5 font-mono focus:outline-blue-500 lg:max-w-[500px]",
                        context.fullscreen ? "" : "rounded-lg border-[1.5px]",
                    ]}
                >
                    {#if context.language}
                        <Editor
                            language={context.language}
                            bind:code={context.code}
                            bind:selections={context.selections}
                            {highlightedRanges}
                            fullscreen={context.fullscreen}
                            onshowexamples={() => (showExamples = true)}
                        />
                    {/if}
                </div>
            {/if}

            <div
                class={[
                    "flex flex-2 flex-col border-black/5",
                    context.fullscreen ? "" : "rounded-lg border-[1.5px]",
                ]}
            >
                <div class="size-full flex-1">
                    <Visualizer
                        bind:this={visualizer}
                        compileResult={context.compileResult}
                        preview={context.preview}
                        bind:show={context.show}
                        selections={context.selections}
                        hiddenNodes={context.hiddenNodes}
                        bind:selectedGroup
                    />
                </div>
            </div>
        </div>
    </div>

    {#if showExamples && context.language != null}
        <Modal width="800px" height="650px" onclose={oncloseexamples}>
            <Examples onclick={onclickexample} onclose={oncloseexamples} />
        </Modal>
    {/if}
{/if}
