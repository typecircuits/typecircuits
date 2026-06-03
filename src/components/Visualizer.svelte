<script lang="ts">
    import { SvelteFlowProvider, useSvelteFlow } from "@xyflow/svelte";
    import Graph from "@/components/Graph.svelte";
    import type * as compiler from "@/compiler";
    import { selectionFilter, type Show } from "@/App.svelte";
    import ShowToggles from "./ShowToggles.svelte";

    interface Props {
        preview?: boolean;
        embed?: boolean;
        selections: [number, number][];
        compileResult: compiler.CompileResult | undefined;
        selectedGroup?: compiler.Group;
        show: Show;
    }

    let {
        preview,
        embed,
        compileResult,
        selections = $bindable(),
        selectedGroup = $bindable(),
        show = $bindable(),
    }: Props = $props();

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

    const keyItems = $derived.by(() => {
        if (compileResult == null) {
            return [];
        }

        const newKeyItems = new Set<string>();
        for (const group of compileResult.groups) {
            if (group.types.length === 0) {
                newKeyItems.add("Other");
            } else if (group.types.length === 1) {
                newKeyItems.add("Expressions");
            } else {
                newKeyItems.add("Conflicts");
            }
        }

        // Enforce consistent order
        const keyItems = [];
        for (const key of Object.keys(keyStyles)) {
            if (newKeyItems.has(key)) {
                keyItems.push(key);
            }
        }

        return keyItems;
    });

    let svelteFlowContext = $state<ReturnType<typeof useSvelteFlow>>();
    export const getNodesBounds = () =>
        svelteFlowContext?.getNodesBounds(svelteFlowContext.getNodes());
</script>

<div class="relative size-full overflow-clip">
    {#if compileResult != null}
        <div class="absolute inset-0 flex">
            <SvelteFlowProvider>
                <Graph
                    bind:context={svelteFlowContext!}
                    {preview}
                    bind:selectedGroup
                    filter={selectionFilter(selections)}
                    {compileResult}
                    {show}
                />
            </SvelteFlowProvider>
        </div>
    {/if}

    {#if !preview}
        {#if keyItems.length > 0}
            <div
                class="absolute top-[10px] left-[10px] z-10 flex flex-col gap-[4px] rounded-[10px] border-[1.5px] border-black/5 bg-white p-[8px] text-sm"
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

        <div
            class="absolute top-[10px] right-[10px] z-10 flex flex-col gap-[4px] rounded-[10px] border-[1.5px] border-black/5 bg-white p-[8px] text-sm"
        >
            <ShowToggles bind:show />
        </div>

        {#if embed}
            <a
                href="https://typecircuits.org"
                target="_blank"
                class="absolute right-[10px] bottom-[10px] z-10 flex flex-row items-center justify-center gap-[6px] rounded-lg border-[1.5px] border-black/5 bg-white px-[6px] py-[4px] text-xs hover:bg-gray-100"
            >
                <img
                    src="https://typecircuits.org/logo.png"
                    alt="Type Circuits"
                    class="size-[20px]"
                />

                <p class="font-medium">Type Circuits</p>
            </a>
        {/if}
    {/if}
</div>
