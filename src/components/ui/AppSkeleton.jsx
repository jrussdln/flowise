/* ------------------------------------------------------------------
   Skeleton stand-ins for everything this app loads: the Loan / Saving
   card grids, the row lists inside the entries dialogs, and the shared
   DataTable body. Each one mirrors the shape of the real content so the
   page does not jump when the data lands — they replace the old
   spinners and "Loading …" messages.

   Bars are painted with --text-muted at low opacity: that colour is
   defined for both themes (light / dark), unlike the raw MUI default,
   which all but disappears on the navy dark theme.
   ------------------------------------------------------------------ */
import { Box, Paper, Skeleton, Stack } from "@mui/material";
import { skeletonBar } from "./skeletonStyles";

const glassCard = {
  borderRadius: 3,
  backgroundColor: "var(--glass-bg-strong)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-medium)",
  boxShadow: "var(--glass-shadow)",
};

/** A grid of placeholder cards, shaped like the Loan / Saving cards:
 *  code + corner actions, title, balance, description, meta rows. */
export function CardGridSkeleton({ count = 6 }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(auto-fill, minmax(280px, 1fr))",
        },
        gap: 2.5,
      }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <Paper
          key={`card-skeleton-${index}`}
          elevation={0}
          sx={{ ...glassCard, p: 2.5, minHeight: 248 }}
        >
          {/* code + status chip / corner icon actions */}
          <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
            <Skeleton sx={skeletonBar} width={78} height={16} />
            <Skeleton sx={skeletonBar} variant="rounded" width={104} height={32} />
          </Stack>
          {/* title, then the balance (and its badge) */}
          <Skeleton sx={{ ...skeletonBar, mt: 2.5 }} width="72%" height={18} />
          <Skeleton sx={{ ...skeletonBar, mt: 1 }} width="46%" height={26} />
          {/* description */}
          <Skeleton sx={{ ...skeletonBar, mt: 2.5 }} width="100%" height={14} />
          <Skeleton sx={{ ...skeletonBar, mt: 1 }} width="64%" height={14} />
          {/* meta rows, pinned low like the real footer */}
          <Skeleton sx={{ ...skeletonBar, mt: 4 }} width="88%" height={14} />
          <Skeleton sx={{ ...skeletonBar, mt: 1.5 }} width="74%" height={14} />
        </Paper>
      ))}
    </Box>
  );
}

/** Placeholder rows shaped like the entries-dialog lists (number, value,
 *  trailing action). */
export function RowsSkeleton({ rows = 4 }) {
  return (
    <Stack spacing={1}>
      {Array.from({ length: rows }).map((_, index) => (
        <Stack
          key={`row-skeleton-${index}`}
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
            px: 1.5,
            py: 1,
            borderRadius: 2,
            backgroundColor: "var(--overlay-dark)",
          }}
        >
          <Skeleton sx={{ ...skeletonBar, opacity: 0.45 }} width={22} height={14} />
          <Skeleton sx={{ ...skeletonBar, opacity: 0.45, flex: 1 }} height={16} />
          <Skeleton
            sx={{ ...skeletonBar, opacity: 0.45 }}
            variant="rounded"
            width={76}
            height={26}
          />
        </Stack>
      ))}
    </Stack>
  );
}
