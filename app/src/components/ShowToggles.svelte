<script lang="ts">
    interface Props {
        show: Record<string, boolean>;
    }

    let { show = $bindable() }: Props = $props();
</script>

<div class="flex flex-row items-center justify-center divide-x-[1.5px] divide-black/5 px-[4px]">
    {#each Object.keys(show) as option}
        <button
            class={[
                "cursor-pointer capitalize not-first:pl-[8px] not-last:pr-[8px]",
                show[option] ? "font-semibold text-blue-500" : "text-black",
            ]}
            onclick={() => (show[option] = !show[option])}
        >
            {option}
        </button>
    {/each}
</div>
