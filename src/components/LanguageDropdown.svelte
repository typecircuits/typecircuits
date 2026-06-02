<script lang="ts">
    import type { Language } from "@/compiler";
    import { languages } from "@/languages";

    interface Props {
        selection: Language;
    }

    let { selection = $bindable() }: Props = $props();
</script>

<select
    class="inline-flex h-[32px] flex-row items-center rounded-[10px] bg-gray-100 px-[6px] hover:bg-gray-200"
    bind:value={selection}
>
    {#each languages as language}
        <option value={language}>{language.name}</option>
    {/each}
</select>
