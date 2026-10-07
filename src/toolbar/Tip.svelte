<script>
  /**
   * A hover tooltip for one option in the staff's tool row. The same text
   * shows on hover and on keyboard focus, and the control points to it with
   * aria-describedby={id} (the bubble stays in the DOM, so the description
   * is read even while it's hidden). Escape hides it until the pointer or
   * focus leaves (WCAG 1.4.13).
   */
  /**
   * @type {{
   *   id: string,
   *   text: string,
   *   align?: "start" | "end",
   *   above?: boolean,
   *   children: import("svelte").Snippet,
   * }}
   */
  let { id, text, align = "start", above = false, children } = $props();
  let dismissed = $state(false);

  /** @param {KeyboardEvent} event */
  function onkeydown(event) {
    if (event.key === "Escape" && !dismissed) dismissed = true;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="tip"
  class:dismissed
  {onkeydown}
  onmouseleave={() => (dismissed = false)}
  onfocusout={() => (dismissed = false)}
>
  {@render children()}
  <span {id} role="tooltip" class="bubble {align}" class:above>{text}</span>
</span>

<style>
  .tip {
    position: relative;
    display: inline-flex;
  }
  .bubble {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 30;
    width: max-content;
    max-width: 19rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--ink);
    color: var(--paper);
    font-size: var(--text-sm);
    font-weight: 400;
    line-height: 1.4;
    white-space: normal;
    text-align: left;
    pointer-events: none;
  }
  .bubble.above {
    top: auto;
    bottom: calc(100% + 6px);
  }
  .bubble.end {
    left: auto;
    right: 0;
  }
  .tip:hover .bubble,
  .tip:has(:global(:focus-visible)) .bubble {
    display: block;
  }
  .tip.dismissed .bubble {
    display: none;
  }
</style>
