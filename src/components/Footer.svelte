<script lang="ts">
    import * as Sentry from "@sentry/browser";

    const onreportissue = (e: MouseEvent) => {
        e.preventDefault();

        Sentry.getFeedback()?.attachTo(document.body, {
            formTitle: "Report Issue",
            showName: false,
            showEmail: false,
            showBranding: false,
            submitButtonLabel: "Submit",
        });
    };
</script>

{#snippet separator()}
    <span class="opacity-25">•</span>
{/snippet}

{#snippet link(url: string, title: string)}
    <a href={url} target="_blank" class="opacity-60 hover:opacity-100">{title}</a>
{/snippet}

<footer
    class="printing:hidden flex flex-row items-center justify-center gap-[8px] px-[10px] text-sm"
>
    {@render link("/", "About")}

    {@render separator()}

    <button onclick={onreportissue} class="cursor-pointer opacity-60 hover:opacity-100">
        Report Issue
    </button>

    {@render separator()}

    {@render link("https://gramer.dev", "Made by Wilson Gramer")}
</footer>
