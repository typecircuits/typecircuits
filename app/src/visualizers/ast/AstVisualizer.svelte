<script lang="ts">
    import type { VisualizerProps } from "..";

    const { compileResult }: VisualizerProps = $props();
</script>

<div class="size-full overflow-scroll p-[10px]">
    {#if compileResult?.ast != null}
        <pre><code>{compileResult.ast()}</code></pre>
    {:else}
        <p>(Missing AST)</p>
    {/if}
</div>
