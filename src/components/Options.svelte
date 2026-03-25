<script lang="ts">
    import Icon from "./Icon.svelte";
    import decamelizeKeys from "decamelize-keys";

    interface Props {
        options: Record<string, boolean>;
        onclose: () => void;
    }

    let { options = $bindable(), onclose }: Props = $props();
</script>

<div class="flex size-full flex-col gap-[10px] pb-[20px]">
    <div class="flex flex-row items-center justify-between px-[20px] pt-[20px]">
        <h1 class="text-2xl font-semibold">Options</h1>

        <button
            onclick={onclose}
            class="flex aspect-square items-center justify-center self-end rounded-full bg-gray-100 p-[6px] transition hover:bg-gray-200"
        >
            <Icon>close</Icon>
        </button>
    </div>

    {#each Object.keys(options) as option}
        <div class="flex flex-row items-center justify-between px-[20px]">
            <label class="flex flex-row items-center gap-[10px] text-lg">
                <input type="checkbox" bind:checked={options[option]} />
                <span class="capitalize">
                    {Object.keys(decamelizeKeys({ [option]: null }, { separator: " " }))[0]}
                </span>
            </label>
        </div>
    {/each}
</div>
