<script lang="ts">
    import { Handle, Position } from "@xyflow/svelte";
    import * as compiler from "@/compiler";
    import {
        nodeLabelFontFamily,
        nodeLabelFontSize,
        nodePaddingX,
        nodePaddingY,
    } from "@/util/layout";
    import { activeNodes } from "./Graph.svelte";

    interface Props {
        data: {
            node: compiler.Node;
            setActive?: (active: boolean) => void;
        };
        width?: number;
        height?: number;
        inGraph?: boolean;
    }

    const { data, width, height, inGraph = true }: Props = $props();

    const isSelected = $derived(
        activeNodes.current.length === 0 || activeNodes.current.includes(data.node),
    );

    const onpointerover = () => {
        data.setActive?.(true);
    };

    const onpointerout = () => {
        data.setActive?.(false);
    };
</script>

<div
    style:width={width && width + "px"}
    style:height={height && height + "px"}
    style:padding-inline="{nodePaddingX}px"
    style:padding-block="{nodePaddingY}px"
    style:opacity={isSelected ? 1 : 0.5}
    class={[
        "relative flex max-h-full max-w-full flex-col items-center justify-center gap-[2px] overflow-clip rounded-lg border-[1.5px] border-gray-400 bg-white text-center shadow-md shadow-black/5 transition-opacity duration-75",
        width == null && "mr-[10px]",
        height == null && "mb-[10px]",
    ]}
    {onpointerover}
    {onpointerout}
>
    <code
        class="w-full text-center whitespace-nowrap"
        style:font-size="{nodeLabelFontSize}px"
        style:font-family={nodeLabelFontFamily}
    >
        {data.node.span.source}
    </code>
</div>

{#if inGraph}
    {#each ["source", "target"] as const as type}
        {#each [Position.Top, Position.Bottom, Position.Left, Position.Right] as position}
            <Handle {type} {position} class="opacity-0" />
        {/each}
    {/each}
{/if}
