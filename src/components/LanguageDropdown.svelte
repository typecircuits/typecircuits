<script lang="ts">
    import languages from "@/languages";

    interface Props {
        selection: string;
    }

    let { selection = $bindable() }: Props = $props();
</script>

<select
    class="inline-flex h-[32px] flex-row items-center rounded-[10px] bg-gray-100 px-[6px] hover:bg-gray-200"
    bind:value={selection}
>
    {#each Object.keys(languages) as language}
        <option value={language}>{language}</option>
    {/each}
</select>
