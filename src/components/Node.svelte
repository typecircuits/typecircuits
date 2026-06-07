<script lang="ts">
    import { Handle, Position } from "@xyflow/svelte";
    import type * as compiler from "@/compiler";
    import {
        nodeLabelFontFamily,
        nodeLabelFontSize,
        nodeMargin,
        nodePaddingX,
        nodePaddingY,
    } from "@/util/layout";
    import { activeNodes } from "./Graph.svelte";
    import Tracker from "./Tracker.svelte";
    import Menu from "./Menu.svelte";
    import MenuButton from "./MenuButton.svelte";
    import Icon from "./Icon.svelte";

    interface Props {
        data: {
            node: compiler.Node;
            onsetactive?: (active: boolean) => void;
            onhide?: () => void;
        };
        width?: number;
        height?: number;
        fontSize?: number;
        paddingTop?: number;
        paddingRight?: number;
        paddingBottom?: number;
        paddingLeft?: number;
        inGraph?: boolean;
        tracker?: { index: number };
    }

    const {
        data,
        width,
        height,
        fontSize = nodeLabelFontSize,
        paddingTop = nodePaddingY,
        paddingRight = nodePaddingX,
        paddingBottom = nodePaddingY,
        paddingLeft = nodePaddingX,
        inGraph = true,
        tracker,
    }: Props = $props();

    const isSelected = $derived(
        activeNodes.current.length === 0 || activeNodes.current.includes(data.node),
    );

    const onpointerover = () => {
        data.onsetactive?.(true);
    };

    const onpointerout = () => {
        data.onsetactive?.(false);
    };
</script>

<Menu event="contextmenu">
    <div
        style:width={width && width + "px"}
        style:height={height && height + "px"}
        style:margin-right={width == null ? nodeMargin + "px" : undefined}
        style:margin-bottom={height == null ? nodeMargin + "px" : undefined}
        style:padding-top="{paddingTop}px"
        style:padding-right="{paddingRight}px"
        style:padding-bottom="{paddingBottom}px"
        style:padding-left="{paddingLeft}px"
        style:opacity={isSelected ? 1 : 0.5}
        style:border-radius="{8}px"
        style:border-color={inGraph ? "var(--color-gray-400)" : "black"}
        class="relative max-h-full max-w-full gap-[2px] overflow-clip border-[1.5px] bg-white text-center transition-opacity duration-75"
        {onpointerover}
        {onpointerout}
    >
        {#if tracker != null}
            <Tracker index={tracker.index} />
        {/if}

        <code
            class="block w-full text-center whitespace-nowrap"
            style:font-size="{fontSize}px"
            style:font-family={nodeLabelFontFamily}
            style:margin-top={height == null ? `-${nodePaddingY}px` : "-0.25lh"}
        >
            {data.node.toString()}
        </code>
    </div>

    {#snippet items()}
        <MenuButton onclick={data.onhide}>
            <Icon>visibility_off</Icon>
            Hide
        </MenuButton>
    {/snippet}
</Menu>

{#if inGraph}
    {#each ["source", "target"] as const as type}
        {#each [Position.Top, Position.Bottom, Position.Left, Position.Right] as position}
            <Handle {type} {position} class="opacity-0" />
        {/each}
    {/each}
{/if}
