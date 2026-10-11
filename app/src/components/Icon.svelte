<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";

    interface Props extends HTMLAttributes<HTMLDivElement> {
        fill?: boolean;
        children: Snippet;
    }

    const { children, ...props }: Props = $props();
</script>

<div {...props} data-fill={props.fill || undefined} class={["material-symbol", props.class]}>
    {@render children()}
</div>
