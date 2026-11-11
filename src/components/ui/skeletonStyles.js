/* Shared look of one skeleton bar (used by AppSkeleton.jsx and
   DataTable.jsx). --text-muted is defined for both themes, so the bars
   stay visible on the light and the navy dark theme — MUI's raw
   default (black at 11%) all but disappears on dark. */
export const skeletonBar = {
  backgroundColor: "var(--text-muted)",
  opacity: 0.3,
};
