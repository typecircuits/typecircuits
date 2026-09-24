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
    import Footer from "./components/Footer.svelte";
    import Menu from "./components/Menu.svelte";
    import MenuButton from "./components/MenuButton.svelte";

    onMount(() => {
        const query = new URLSearchParams(window.location.search);

        if (query.has("embed")) {
            context.embed = true;
            context.project = "visualization";
            return;
        }

        if (query.has("preview")) {
            context.preview = true;
        }

        if (query.has("project")) {
            context.project = query.get("project") as any;
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
                context.visualizer = "Circuit";
                context.code = JSON.stringify(event.data.embed);

                if (!setShow) {
                    Object.assign(context.show, event.data.show);
                    setShow = true;
                }
            }
        });

        window.parent.postMessage("requestEmbed", "*");
    });

    const Visualizer = $derived(
        context.visualizer ? allVisualizers[context.visualizer] : undefined,
    );

    let visualizer = $state<VisualizerBindings<any>>();

    const editorSizes = $derived(
        context.project === "code"
            ? { fontSize: "28pt", lineHeight: "2.25" }
            : { fontSize: "12pt", lineHeight: "1.5" },
    );

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

    const onproject = (value: typeof context.project) => {
        document.body.requestFullscreen();
        context.project = value;
    };

    onMount(() => {
        document.addEventListener("fullscreenchange", (e) => {
            if (document.fullscreenElement == null) {
                context.project = undefined;
            }
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
        style:padding={context.project != null ? "4px" : "10px"}
        style:gap={context.project != null ? "0" : "10px"}
    >
        <div class="flex flex-row items-center justify-between gap-[10px]">
            {#if context.project == null}
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

            {#if context.project == null || context.errorMessage}
                <input
                    type="text"
                    placeholder="error message"
                    bind:value={context.errorMessage}
                    class="h-full flex-1 rounded-[10px] text-center font-mono text-sm not-placeholder-shown:border-transparent not-placeholder-shown:bg-red-50 not-placeholder-shown:text-red-500 placeholder-shown:border-black/5"
                    style:font-size={context.project != null ? "20pt" : undefined}
                    style:border-width={context.project != null ? undefined : "1.5px"}
                />
            {/if}

            {#if context.project == null}
                <div class="flex flex-row items-center gap-[10px]">
                    <Menu>
                        <Button>
                            <Icon>tv</Icon>
                            Project
                        </Button>

                        {#snippet items()}
                            <MenuButton onclick={() => onproject("code")}>Code</MenuButton>

                            <MenuButton onclick={() => onproject("visualization")}>
                                Visualization
                            </MenuButton>
                        {/snippet}
                    </Menu>

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
                </div>
            {/if}
        </div>

        <div
            class="relative flex min-h-0 flex-1 flex-col lg:flex-row"
            style:gap={context.project != null ? "0" : "10px"}
        >
            {#if context.project == null || context.project === "code"}
                <div
                    class={[
                        "flex flex-1 resize-none overflow-clip border-[1.5px] border-black/5 font-mono focus:outline-blue-500",
                        context.project != null
                            ? "mx-[10vw] my-[5vh] rounded-2xl shadow-lg"
                            : "rounded-lg lg:max-w-[500px]",
                    ]}
                >
                    {#if context.language}
                        <Editor
                            fontSize={editorSizes.fontSize}
                            lineHeight={editorSizes.lineHeight}
                            readOnly={context.project === "code"}
                            onshowexamples={() => (showExamples = true)}
                        />
                    {/if}
                </div>
            {/if}

            {#if context.project == null || context.project === "visualization"}
                <div
                    class={[
                        "flex flex-2 flex-col border-black/5",
                        context.project != null ? "" : "rounded-lg border-[1.5px]",
                    ]}
                >
                    <div class="size-full flex-1">
                        <Visualizer
                            bind:this={visualizer}
                            compileResult={context.compileResult}
                            preview={context.preview}
                            embed={context.embed}
                            bind:show={context.show}
                            selections={context.selections}
                            hiddenNodes={context.hiddenNodes}
                            bind:selectedGroup
                        />
                    </div>
                </div>
            {/if}
        </div>

        {#if !context.embed && !context.preview}
            <Footer />
        {/if}
    </div>

    {#if showExamples && context.language != null}
        <Modal width="800px" height="650px" onclose={oncloseexamples}>
            <Examples onclick={onclickexample} onclose={oncloseexamples} />
        </Modal>
    {/if}
{/if}
