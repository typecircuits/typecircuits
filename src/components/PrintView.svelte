<script module lang="ts">
    export interface PrintOptions {
        trackers?: boolean;
    }
</script>

<script lang="ts">
    import type * as compiler from "@/core/compiler";
    import Node from "@/visualizers/circuit/Node.svelte";

    interface Props {
        errorMessage?: string;
        options: PrintOptions;
        nodes: compiler.Node[];
        onfinish: () => void;
    }

    const { errorMessage, nodes, options, onfinish }: Props = $props();

    $effect(() => {
        requestAnimationFrame(() => {
            window.print();
            onfinish();
        });
    });
</script>

<div>
    <div
        class="mb-[20px] flex w-fit flex-col gap-[20px] font-mono text-[18px] leading-relaxed whitespace-pre-wrap"
    >
        {#if errorMessage}
            <p class="rounded-lg border-[1.5px] border-gray-400 p-[10px]">
                {errorMessage}
            </p>
        {/if}
    </div>

    {#each nodes as node, index}
        <div class="inline-block">
            <Node
                data={{ node }}
                fontSize={24}
                paddingTop={options.trackers ? 0 : 24}
                paddingBottom={options.trackers ? undefined : 24}
                inGraph={false}
                tracker={options.trackers ? { index } : undefined}
            />
        </div>
    {/each}
</div>
