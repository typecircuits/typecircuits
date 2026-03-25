<script lang="ts">
    import { activeNodes } from "./Graph.svelte";
    import Icon from "./Icon.svelte";

    const { data, width, height } = $props();

    const kind = $derived(
        data.labels.length === 0 ? undefined : data.labels.length > 1 ? "conflict" : "typed",
    );

    const isActive = $derived(
        activeNodes.current.length === 0 ||
            activeNodes.current.some((node) => data.nodes.includes(node)),
    );

    const showGroups = $derived(data.options.showGroups);
</script>

{#if showGroups}
    <div style:opacity={isActive ? 1 : 0.3} class="transition-opacity duration-75">
        <code
            class="flex h-[24px] flex-row items-center gap-[1ch] px-[4px] text-center text-[90%] font-medium"
            style:color={data.color}
        >
            {#if data.labels.length > 1}
                <Icon class="bg-white align-middle">error</Icon>
            {/if}

            {#each data.labels as label, index}
                {#if index > 0}
                    <span class="opacity-75">/</span>
                {/if}

                <pre class="inline">{label}</pre>
            {/each}
        </code>

        <div
            class={[
                "relative flex max-h-full max-w-full flex-col items-center overflow-clip rounded-lg border-[1.5px] text-center shadow-black/5 **:pointer-events-none",
                kind === "conflict" ? "border-dashed bg-lines" : "",
            ]}
            style:width="{width}px"
            style:height="{height}px"
            style:--bg-lines-color="color-mix(in srgb, {data.color} 40%, transparent)"
            style:background={kind === undefined
                ? "color-mix(in srgb, var(--color-gray-300) 40%, transparent)"
                : kind === "typed"
                  ? `color-mix(in srgb, ${data.color} 40%, transparent)`
                  : undefined}
            style:border-color={data.labels.length === 0 ? "var(--color-gray-300)" : data.color}
        ></div>
    </div>
{/if}
