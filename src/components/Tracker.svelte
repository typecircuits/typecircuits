<script lang="ts">
    import { arucoToSVGString } from "aruco-marker";

    interface Props {
        index: number;
    }

    const { index }: Props = $props();

    const tagSvg = $derived(arucoToSVGString(index));
</script>

<div class="mx-auto mb-[24px] size-[0.65in]">
    {@html tagSvg}
</div>
