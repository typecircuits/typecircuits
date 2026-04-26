<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        onclick: () => void;
        children: Snippet;
    }

    const { onclick, children }: Props = $props();
</script>

<button
    {onclick}
    class="flex flex-1 cursor-pointer flex-row items-center gap-2.5 rounded-md px-2.5 py-1 hover:bg-black/5"
>
    {@render children()}
</button>
