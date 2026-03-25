<script lang="ts">
    import { onMount, type Snippet } from "svelte";
    import { fade, fly } from "svelte/transition";

    interface Props {
        children: Snippet;
        onclose: () => void;
        width: string;
        height: string;
    }

    const { children, onclose, width, height }: Props = $props();

    onMount(() => {
        const onkeydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onclose();
            }
        };

        window.addEventListener("keydown", onkeydown);

        return () => {
            window.removeEventListener("keydown", onkeydown);
        };
    });
</script>

<div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-999 flex items-center-safe justify-center-safe bg-black/20"
>
    <div
        transition:fly={{ y: 40, duration: 200 }}
        class="rounded-[20px] bg-white"
        style:width
        style:height
    >
        {@render children()}
    </div>
</div>
