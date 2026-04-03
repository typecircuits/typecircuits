<script lang="ts">
    import { Handle, Position } from "@xyflow/svelte";
    import * as compiler from "@/compiler";
    import {
        nodeLabelFontFamily,
        nodeLabelFontSize,
        nodeMargin,
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
        scale?: number;
        inGraph?: boolean;
    }

    const { data, width, height, scale = 1, inGraph = true }: Props = $props();

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
    style:margin-right={width == null ? nodeMargin + "px" : undefined}
    style:margin-bottom={height == null ? nodeMargin + "px" : undefined}
    style:padding-inline="{nodePaddingX * scale}px"
    style:padding-block="{nodePaddingY * scale}px"
    style:opacity={isSelected ? 1 : 0.5}
    style:border-radius="{8 * scale}px"
    class="relative max-h-full max-w-full gap-[2px] overflow-clip border-[1.5px] border-gray-400 bg-white text-center transition-opacity duration-75"
    {onpointerover}
    {onpointerout}
>
    <code
        class="block w-full text-center whitespace-nowrap"
        style:font-size="{nodeLabelFontSize * scale}px"
        style:font-family={nodeLabelFontFamily}
        style:margin-top={height == null ? `-${nodePaddingY}px` : "-0.25lh"}
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
