<script lang="ts">
    interface Props<T> {
        options: T[];
        optionName: (option: T) => string;
        selection: T;
    }

    let { options, optionName, selection = $bindable() }: Props<any> = $props();
</script>

<select
    class="inline-flex h-[32px] flex-row items-center rounded-[10px] bg-gray-100 px-[6px] hover:bg-gray-200"
    bind:value={selection}
>
    {#each options as option}
        <option value={option}>{optionName(option)}</option>
    {/each}
</select>
