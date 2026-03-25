<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";

    interface Props extends HTMLButtonAttributes {
        children: Snippet;
    }

    const { children, ...props }: Props = $props();
</script>

<button
    {...props}
    class={[
        "flex h-[32px] cursor-pointer flex-row items-center justify-center gap-[6px] rounded-[10px] bg-gray-100 px-[8px] hover:bg-gray-200",
        props.class,
    ]}
>
    {@render children()}
</button>
