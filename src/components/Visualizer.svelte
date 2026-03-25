<script lang="ts">
    import {
        SvelteFlowProvider,
        getNodesBounds as svelteFlowGetNodesBounds,
        useSvelteFlow,
    } from "@xyflow/svelte";
    import Graph from "@/components/Graph.svelte";
    import languages from "@/languages";
    import * as compiler from "@/compiler";

    interface Props {
        preview?: boolean;
        embed?: boolean;
        language: string;
        code: string;
        options: Record<string, boolean>;
        selections: [number, number][];
        graphData?: compiler.CompilerOutput;
        selectedGroup?: compiler.Group;
        filter: (node: compiler.Node) => boolean;
    }

    let {
        preview,
        embed,
        language,
        code,
        options,
        selections = $bindable(),
        graphData = $bindable(),
        selectedGroup = $bindable(),
        filter = $bindable(),
    }: Props = $props();

    const debounce = <T extends any[]>(timeout: number, f: (...args: T) => void) => {
        let timeoutId: number;
        return (...args: T) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => f(...args), timeout);
        };
    };

    const metaKey = navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl";

    const keyStyles = {
        Expressions: {
            color: "var(--color-blue-500)",
            class: "border-solid",
        },
        Conflicts: {
            color: "var(--color-blue-600)",
            class: "border-dashed bg-lines",
        },
        Other: {
            color: "var(--color-gray-500)",
            class: "border-solid",
        },
    };

    let status = $state<string>();
    let keyItems = $state<string[]>([]);

    const update = debounce(
        50,
        async (language: string, code: string, options: Record<string, boolean>) => {
            status =
                selections.length > 0
                    ? `Filtering by selection (hold ${metaKey} to select multiple)`
                    : "Showing all (select code to filter)";

            graphData = languages[language].compiler(code, $state.snapshot(options));

            filter = (node: compiler.Node) =>
                node.display !== "hidden" &&
                (selections.length === 0 ||
                    selections.some(
                        ([from, to]) =>
                            node.span != null &&
                            node.span.start.index >= from &&
                            node.span.end.index <= to,
                    ));

            const newKeyItems = new Set<string>();
            for (const group of graphData.groups.groups.values()) {
                if (group.types.length === 0) {
                    newKeyItems.add("Other");
                } else if (group.types.length === 1) {
                    newKeyItems.add("Expressions");
                } else {
                    newKeyItems.add("Conflicts");
                }
            }

            // Enforce consistent order
            keyItems = [];
            for (const key of Object.keys(keyStyles)) {
                if (newKeyItems.has(key)) {
                    keyItems.push(key);
                }
            }
        },
    );

    $effect(() => {
        if (embed) return;

        update(
            language,
            code,
            // Note: object spread is needed to deeply track options, since
            // `$state.snapshot` is used in `update`
            { ...options },
        );
    });

    let svelteFlowContext = $state<ReturnType<typeof useSvelteFlow>>();
    export const getNodesBounds = () =>
        svelteFlowContext?.getNodesBounds(svelteFlowContext.getNodes());
</script>

<div class="relative size-full overflow-clip">
    {#if graphData != null}
        <div class="absolute inset-0 flex">
            <SvelteFlowProvider>
                <Graph
                    bind:context={svelteFlowContext!}
                    {preview}
                    bind:selectedGroup
                    {filter}
                    {options}
                    {...graphData}
                />
            </SvelteFlowProvider>
        </div>
    {/if}

    {#if !preview}
        {#if status}
            <p
                class="absolute top-[10px] left-[10px] z-10 rounded-full border-[1.5px] border-black/5 bg-white px-[8px] py-[2px] text-sm"
            >
                {status}
            </p>
        {/if}

        {#if keyItems.length > 0}
            <div
                class="absolute top-[10px] right-[10px] z-10 flex flex-col gap-[4px] rounded-[10px] border-[1.5px] border-black/5 bg-white p-[8px] text-sm"
            >
                {#each keyItems as item}
                    {@const { color, class: className } = keyStyles[item as keyof typeof keyStyles]}

                    <div class="flex flex-row items-center gap-[8px]">
                        <div
                            style:--color={color}
                            style:--bg-lines-color="color-mix(in srgb, {color} 50%, transparent)"
                            style:--bg-lines-size="3px"
                            class={[
                                "size-[16px] rounded-[4px] border-[1.5px] border-(--color)/70 bg-(--color)/10",
                                className,
                            ]}
                        ></div>

                        <p>{item}</p>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}
</div>
