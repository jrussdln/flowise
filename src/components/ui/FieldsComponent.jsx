import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { colorHex, normalizeColor } from "../../lib/cards";
// ── Custom field type icons ─────────────────────────────────────────────────
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined"; // TIN
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined"; // Bank
import LockOutlinedIcon from "@mui/icons-material/LockOutlined"; // Password
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail"; // Email
import PhoneIphoneOutlinedIcon from "@mui/icons-material/PhoneIphoneOutlined"; // Phone
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined"; // Username

/**
 * Reusable Form Fields Component.
 *
 * Props:
 * - fields:   [{ name, label, type, required, gridCols, options, ... }]
 *   types: text | number | password | email | phone | username | tin | bank |
 *          date | time | datetime-local | peso | color | select | label |
 *          checkbox | custom (field.render) — plus `multiline: true` for
 *          textareas.
 *   `color` is a select of enumerated codes (like `options` on a select)
 *   that leads with a live swatch of the current value — see
 *   colorOptions()/colorHex() in src/lib/cards.js.
 * - switches: [{ name, label, mobileLabel, disabled, xs }] toggle rows
 * - values:   { [name]: value }
 * - errors:   { [name]: message } — shown as helper text
 * - onChange: (name, value) => void
 * - onSwitchChange: (name, value) => void (falls back to onChange)
 * - onLastFieldTab: () => void — Tab past the last field
 * - autoFocus: focus the first field 300ms after mount (default true)
 */

/* ── Icon map for special field types ─────────────────────────────────────── */
const FIELD_TYPE_META = {
  tin: {
    icon: BadgeOutlinedIcon,
    inputMode: "numeric",
    placeholder: "000-000-000-00000",
  },
  bank: {
    icon: AccountBalanceOutlinedIcon,
    inputMode: "numeric",
    placeholder: "Account number",
  },
  password: { icon: LockOutlinedIcon, inputMode: undefined, placeholder: "" },
  email: {
    icon: AlternateEmailIcon,
    inputMode: "email",
    placeholder: "you@example.com",
  },
  phone: {
    icon: PhoneIphoneOutlinedIcon,
    inputMode: "tel",
    placeholder: "0900-000-0000",
  },
  username: {
    icon: AccountCircleOutlinedIcon,
    inputMode: undefined,
    placeholder: "Username",
  },
};

// PH TIN is grouped as 3-3-3-5 (9-digit base + 5-digit branch code)
const TIN_GROUP_SIZES = [3, 3, 3, 5];
const TIN_MAX_DIGITS = TIN_GROUP_SIZES.reduce((a, b) => a + b, 0);

const BANK_MAX_DIGITS = 16;
const PHONE_MAX_DIGITS = 11;

const ICON_SX = { fontSize: "1rem", color: "var(--text-muted)" };

const DATETIME_TYPES = ["date", "time", "datetime-local"];

/** Formats a raw digit string into PH TIN grouping, e.g. 123456789 -> "123-456-789". */
function formatTin(rawDigits) {
  const digits = rawDigits.replace(/\D/g, "").slice(0, TIN_MAX_DIGITS);
  const parts = [];
  let cursor = 0;
  for (const size of TIN_GROUP_SIZES) {
    if (cursor >= digits.length) break;
    parts.push(digits.slice(cursor, cursor + size));
    cursor += size;
  }
  return parts.join("-");
}

/* Theme-aware field chrome — this app paints MUI through CSS variables. */
const styles = {
  "& .MuiInputBase-root": {
    color: "var(--text-primary)",
    backgroundColor: "var(--bg-primary)",
  },
  "& .MuiInputLabel-root": {
    color: "var(--text-muted)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "var(--accent)",
  },
  "& .MuiOutlinedInput-root": {
    "& fieldset": {
      borderColor: "var(--border-medium)",
    },
    "&:hover fieldset": {
      borderColor: "var(--accent)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "var(--accent)",
    },
  },
};

export default function FieldsComponent({
  fields = [],
  switches = [],
  values = {},
  errors = {},
  onChange,
  onSwitchChange,
  onLastFieldTab,
  autoFocus = true,
}) {
  const inputRefs = useRef([]);
  const [showPassword, setShowPassword] = useState({});
  const [pesoDisplayValues, setPesoDisplayValues] = useState({});
  const [selectSearch, setSelectSearch] = useState({});
  const [focusedDate, setFocusedDate] = useState({});

  const setValue = (name, value) => {
    if (onChange) onChange(name, value);
  };

  const togglePasswordVisibility = (name) =>
    setShowPassword((prev) => ({ ...prev, [name]: !prev[name] }));

  // Focus the first rendered input once the dialog has finished opening.
  useEffect(() => {
    if (autoFocus === false) return undefined;
    const timer = setTimeout(() => {
      const first = inputRefs.current.find((el) => el);
      first?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const focusAdjacent = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex >= 0 && nextIndex < inputRefs.current.length) {
      inputRefs.current[nextIndex]?.focus();
    } else if (direction > 0 && onLastFieldTab) {
      onLastFieldTab();
    }
  };

  const handleKeyDown = (e, index, multiline) => {
    if (multiline) return;

    if (e.key === "Enter") {
      e.preventDefault();
      focusAdjacent(index, 1);
      return;
    }

    if (e.key === "Tab") {
      // Only intercept forward Tab; let Shift+Tab use native backward
      // navigation so users aren't stuck unable to move to a previous field.
      if (e.shiftKey) return;
      e.preventDefault();
      focusAdjacent(index, 1);
    }
  };

  const assignRef = (index, el) => {
    inputRefs.current[index] = el;
  };

  const gridSize = (field) => ({ xs: 12, sm: field.gridCols ?? field.xs ?? 12 });

  // ── Special typed field renderer ─────────────────────────────────────────
  const renderSpecialField = (field, index) => {
    const meta = FIELD_TYPE_META[field.type];
    const IconComp = meta.icon;
    const isPassword = field.type === "password";
    const visible = showPassword[field.name];

    const handleTinChange = (e) => setValue(field.name, formatTin(e.target.value));

    const handleNumericChange = (e) => {
      const max = field.type === "bank" ? BANK_MAX_DIGITS : PHONE_MAX_DIGITS;
      const raw = e.target.value.replace(/\D/g, "").slice(0, max);
      setValue(field.name, raw);
    };

    const changeHandler =
      field.type === "tin"
        ? handleTinChange
        : field.type === "bank" || field.type === "phone"
          ? handleNumericChange
          : (e) => setValue(field.name, e.target.value);

    return (
      <Grid size={gridSize(field)} key={field.name}>
        <TextField
          label={field.label}
          name={field.name}
          fullWidth
          size="small"
          sx={styles}
          type={isPassword ? (visible ? "text" : "password") : "text"}
          inputMode={meta.inputMode}
          value={values[field.name] ?? ""}
          error={!!errors[field.name]}
          helperText={errors[field.name] || field.helperText || ""}
          disabled={field.disabled}
          required={field.required}
          placeholder={field.placeholder ?? meta.placeholder}
          inputRef={(el) => assignRef(index, el)}
          onKeyDown={(e) => handleKeyDown(e, index, false)}
          onChange={changeHandler}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <IconComp sx={ICON_SX} />
                </InputAdornment>
              ),
              ...(isPassword && {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => togglePasswordVisibility(field.name)}
                      edge="end"
                      size="small"
                      disabled={field.disabled}
                      aria-label={visible ? "Hide password" : "Show password"}
                    >
                      {visible ? <Visibility sx={ICON_SX} /> : <VisibilityOff sx={ICON_SX} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }),
            },
          }}
        />
      </Grid>
    );
  };

  return (
    <Grid container spacing={1.5}>
      {fields.map((field, index) => {
        // ── Special icon fields ────────────────────────────────────────────
        if (FIELD_TYPE_META[field.type]) {
          return renderSpecialField(field, index);
        }

        const disabled = field.dependsOn ? !values[field.dependsOn] : false;

        // ── Custom render ──────────────────────────────────────────────────
        if (field.type === "custom" && field.render) {
          return (
            <Grid size={gridSize(field)} key={field.name}>
              {field.render()}
            </Grid>
          );
        }

        // ── Date / time / datetime field ───────────────────────────────────
        if (DATETIME_TYPES.includes(field.type)) {
          const isFocused = !!focusedDate[field.name];
          const rawValue = values[field.name] ?? "";
          const isFieldDisabled = field.disabled || disabled;

          const formatDisplay = () => {
            if (!rawValue) return "";

            if (field.type === "date") {
              return new Date(rawValue + "T00:00:00").toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "2-digit",
              });
            }

            if (field.type === "time") {
              const [h, m] = String(rawValue).split(":");
              const d = new Date();
              d.setHours(Number(h), Number(m));
              return d.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
            }

            // datetime-local: "2026-07-13T14:30" -> "Jul 13, 2026, 2:30 PM"
            return new Date(rawValue).toLocaleString("en-US", {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
          };

          return (
            <Grid size={gridSize(field)} key={field.name}>
              <Box sx={{ position: "relative" }}>
                <TextField
                  label={field.label}
                  name={field.name}
                  type={isFocused ? field.type : "text"}
                  fullWidth
                  size="small"
                  sx={styles}
                  value={isFocused ? rawValue : formatDisplay()}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  error={!!errors[field.name]}
                  helperText={errors[field.name] || field.helperText || ""}
                  disabled={isFieldDisabled}
                  required={field.required}
                  placeholder={field.placeholder || ""}
                  inputRef={(el) => assignRef(index, el)}
                  onKeyDown={(e) => handleKeyDown(e, index, false)}
                  onFocus={() => setFocusedDate((prev) => ({ ...prev, [field.name]: true }))}
                  onBlur={() => setFocusedDate((prev) => ({ ...prev, [field.name]: false }))}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: {
                      min: field.minDate,
                      max: field.maxDate,
                      step: field.step, // e.g. 60 for whole-minute steps
                      readOnly: !isFocused,
                    },
                  }}
                />
                {!isFocused && !isFieldDisabled && (
                  <Box
                    component="button"
                    type="button"
                    aria-label={`Open ${field.label} picker`}
                    onClick={() => {
                      setFocusedDate((prev) => ({ ...prev, [field.name]: true }));
                      // Arm the field (it renders as a native date input), then
                      // focus it and open the picker so one click is enough.
                      requestAnimationFrame(() => {
                        const el = inputRefs.current[index];
                        el?.focus();
                        if (typeof el?.showPicker === "function") {
                          try {
                            el.showPicker();
                          } catch {
                            /* browser refused (e.g. not focused) — a second
                               click on the now-native input opens it anyway */
                          }
                        }
                      });
                    }}
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                )}
              </Box>
            </Grid>
          );
        }

        // ── Peso field ─────────────────────────────────────────────────────
        if (field.type === "peso") {
          const rawStored = values[field.name];
          const displayValue =
            pesoDisplayValues[field.name] !== undefined
              ? pesoDisplayValues[field.name]
              : rawStored !== undefined && rawStored !== ""
                ? Number(rawStored).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "";

          return (
            <Grid size={gridSize(field)} key={field.name}>
              <TextField
                label={field.label}
                name={field.name}
                type="text"
                fullWidth
                size="small"
                sx={styles}
                value={displayValue}
                error={!!errors[field.name]}
                helperText={errors[field.name] || field.helperText || ""}
                disabled={field.disabled || disabled}
                required={field.required}
                placeholder={field.placeholder || "0.00"}
                inputRef={(el) => assignRef(index, el)}
                onKeyDown={(e) => {
                  handleKeyDown(e, index, false);
                  const allowedKeys = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "Tab",
                    "Enter",
                    ".",
                  ];
                  if (!/[0-9]/.test(e.key) && !allowedKeys.includes(e.key)) e.preventDefault();
                }}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, "");
                  if (/^\d*\.?\d{0,2}$/.test(raw)) {
                    setPesoDisplayValues((prev) => ({ ...prev, [field.name]: raw }));
                    setValue(field.name, raw);
                  }
                }}
                onBlur={() => {
                  const raw = values[field.name];
                  setPesoDisplayValues((prev) => {
                    const updated = { ...prev };
                    delete updated[field.name];
                    return updated;
                  });
                  if (raw !== "" && raw !== undefined && !isNaN(Number(raw))) {
                    setValue(field.name, Number(raw).toFixed(2));
                  }
                }}
                onFocus={() => {
                  const raw = values[field.name];
                  const unformatted =
                    raw !== "" && raw !== undefined && !isNaN(Number(raw)) ? String(Number(raw)) : "";
                  setPesoDisplayValues((prev) => ({ ...prev, [field.name]: unformatted }));
                }}
                slotProps={{
                  input: {
                    readOnly: field.readOnly,
                    startAdornment: (
                      <InputAdornment position="start">
                        <Typography variant="body2" sx={{ color: "var(--text-muted)" }}>
                          ₱
                        </Typography>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Grid>
          );
        }

        // ── Colour field (enumerated codes + swatch, like the period type) ──
        if (field.type === "color") {
          /* Canonical value: a code stays a code and a legacy hex stays a
             hex, so the select always lands on one of its options. */
          const value = normalizeColor(values[field.name]);
          const swatch = colorHex(value);
          const options = field.options ?? [];

          return (
            <Grid size={gridSize(field)} key={field.name}>
              <TextField
                select
                label={field.label}
                name={field.name}
                fullWidth
                size="small"
                sx={styles}
                value={value}
                error={!!errors[field.name]}
                helperText={errors[field.name] || field.helperText || ""}
                disabled={field.disabled || disabled}
                required={field.required}
                inputRef={(el) => assignRef(index, el)}
                onChange={(e) => setValue(field.name, e.target.value)}
                slotProps={{
                  input: {
                    /* the current colour, ahead of the label */
                    startAdornment: (
                      <InputAdornment position="start">
                        <Box
                          aria-hidden
                          sx={{
                            width: 16,
                            height: 16,
                            flexShrink: 0,
                            borderRadius: 0.5,
                            border: "1px solid var(--border-medium)",
                            bgcolor: swatch || "transparent",
                          }}
                        />
                      </InputAdornment>
                    ),
                  },
                  select: {
                    MenuProps: {
                      slotProps: {
                        paper: { sx: { maxHeight: 300 } },
                        list: { autoFocusItem: false },
                      },
                      autoFocus: false,
                    },
                  },
                }}
              >
                {options.map((opt) => (
                  <MenuItem key={opt.value || "none"} value={opt.value}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          flexShrink: 0,
                          borderRadius: 0.5,
                          border: "1px solid var(--border-medium)",
                          bgcolor: colorHex(opt.value) || "transparent",
                        }}
                      />
                      <Typography variant="body2">{opt.label}</Typography>
                      {/* the stored code, spelled out — G = Green */}
                      {opt.value && (
                        <Typography
                          variant="caption"
                          sx={{ color: "var(--text-muted)", fontFamily: "monospace" }}
                        >
                          {opt.value}
                        </Typography>
                      )}
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          );
        }

        // ── Select field ───────────────────────────────────────────────────
        if (field.type === "select") {
          const options = field.options || [];
          const isLoadingOptions = field.loading === true;
          const searchTerm = (selectSearch[field.name] || "").toLowerCase();
          const filteredOptions = options.filter((opt) =>
            String(opt.label ?? "").toLowerCase().includes(searchTerm),
          );

          return (
            <Grid size={gridSize(field)} key={field.name}>
              <TextField
                select
                fullWidth
                size="small"
                sx={styles}
                label={field.label}
                name={field.name}
                value={values[field.name] ?? ""}
                onChange={(e) => setValue(field.name, e.target.value)}
                error={!!errors[field.name]}
                helperText={errors[field.name] || field.helperText || ""}
                disabled={field.disabled || disabled}
                required={field.required}
                inputRef={(el) => assignRef(index, el)}
                slotProps={{
                  select: {
                    MenuProps: {
                      slotProps: {
                        paper: { sx: { maxHeight: 300 } },
                        list: { autoFocusItem: false }, // stop MUI stealing focus for its typeahead
                      },
                      autoFocus: false,
                    },
                    onOpen: () => {
                      if (options.length > 8) {
                        setTimeout(() => {
                          const input = document.getElementById(
                            `select-search-${field.name}`,
                          );
                          input?.focus();
                        }, 50);
                      }
                    },
                    onClose: () =>
                      setSelectSearch((prev) => ({ ...prev, [field.name]: "" })),
                  },
                }}
              >
                {options.length > 8 && (
                  <MenuItem
                    disableRipple
                    disableTouchRipple
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()} // prevent click from "selecting" this row
                    sx={{
                      p: 0,
                      "&:hover": { backgroundColor: "transparent" },
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    <TextField
                      id={`select-search-${field.name}`}
                      size="small"
                      placeholder="Search..."
                      fullWidth
                      autoFocus // grab focus as soon as it mounts
                      value={selectSearch[field.name] || ""}
                      onChange={(e) =>
                        setSelectSearch((prev) => ({ ...prev, [field.name]: e.target.value }))
                      }
                      onKeyDown={(e) => e.stopPropagation()}
                      onKeyUp={(e) => e.stopPropagation()} // typeahead also listens on keyup
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()} // stop click-to-select-item
                      sx={{
                        px: 1,
                        py: 0.5,
                        "& .MuiOutlinedInput-root": {
                          backgroundColor: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          "& fieldset": { borderColor: "var(--border-medium)" },
                          "&:hover fieldset": { borderColor: "var(--accent)" },
                          "&.Mui-focused fieldset": { borderColor: "var(--accent)" },
                        },
                        "& .MuiInputBase-input::placeholder": {
                          color: "var(--text-muted)",
                          opacity: 1,
                        },
                      }}
                      autoComplete="off"
                    />
                  </MenuItem>
                )}

                {isLoadingOptions ? (
                  [1, 2, 3].map((i) => (
                    <MenuItem key={i} disabled sx={{ py: 0.8 }}>
                      <Skeleton
                        variant="text"
                        width={`${45 + i * 15}%`}
                        height={14}
                        sx={{ borderRadius: 1 }}
                      />
                    </MenuItem>
                  ))
                ) : filteredOptions.length === 0 ? (
                  <MenuItem disabled>
                    <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                      {field.emptyText || "No data available"}
                    </Typography>
                  </MenuItem>
                ) : (
                  filteredOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Grid>
          );
        }

        // ── Section label ──────────────────────────────────────────────────
        if (field.type === "label") {
          return (
            <Grid size={{ xs: 12 }} key={`label-${field.name || index}`}>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 200, color: "var(--text-primary)" }}
              >
                {field.label}
              </Typography>
            </Grid>
          );
        }

        // ── Checkbox ───────────────────────────────────────────────────────
        if (field.type === "checkbox") {
          return (
            <Grid size={{ xs: field.xs ?? 12 }} key={field.name}>
              <FormControlLabel
                control={
                  <Checkbox
                    name={field.name}
                    checked={!!values[field.name]}
                    onChange={(e) => setValue(field.name, e.target.checked)}
                    color="primary"
                    disabled={field.disabled || disabled}
                  />
                }
                label={field.label || ""}
              />
            </Grid>
          );
        }

        // ── Multiline (plain textarea only) ────────────────────────────────
        if (field.multiline) {
          return (
            <Grid size={gridSize(field)} key={field.name}>
              <TextField
                label={field.label}
                name={field.name}
                placeholder={field.placeholder}
                fullWidth
                size="small"
                sx={styles}
                multiline
                minRows={field.minRows || field.rows || 3}
                maxRows={field.maxRows}
                value={values[field.name] ?? ""}
                onChange={(e) => setValue(field.name, e.target.value)}
                error={!!errors[field.name]}
                helperText={errors[field.name] || field.helperText || ""}
                disabled={field.disabled || disabled}
                required={field.required}
                inputRef={(el) => assignRef(index, el)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation(); // allow newline, don't trigger form submit
                    return;
                  }
                  handleKeyDown(e, index, true);
                }}
              />
            </Grid>
          );
        }

        // ── Normal TextField (including legacy password without icon) ──────
        const isPassword = field.type === "password";
        return (
          <Grid size={gridSize(field)} key={field.name}>
            <TextField
              label={field.label}
              name={field.name}
              type={
                isPassword
                  ? showPassword[field.name]
                    ? "text"
                    : "password"
                  : field.type || "text"
              }
              fullWidth
              size="small"
              sx={styles}
              value={values[field.name] ?? ""}
              error={!!errors[field.name]}
              helperText={errors[field.name] || field.helperText || ""}
              disabled={field.disabled || disabled}
              required={field.required}
              placeholder={field.placeholder || ""}
              inputRef={(el) => assignRef(index, el)}
              onKeyDown={(e) => {
                handleKeyDown(e, index, field.multiline);
                if (field.numberOnly) {
                  const allowedKeys = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "Tab",
                    "Enter",
                  ];
                  if (!/[0-9]/.test(e.key) && !allowedKeys.includes(e.key)) e.preventDefault();
                }
              }}
              onChange={(e) => {
                let value = e.target.value;
                if (field.numberOnly) value = value.replace(/[^0-9]/g, "");
                setValue(field.name, value);
              }}
              slotProps={{
                ...(isPassword && {
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => togglePasswordVisibility(field.name)}
                          edge="end"
                          disabled={field.disabled || disabled}
                          aria-label={
                            showPassword[field.name] ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword[field.name] ? <Visibility /> : <VisibilityOff />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }),
              }}
            />
          </Grid>
        );
      })}

      {switches.map((sw) => (
        <Grid size={{ xs: sw.xs ?? 12 }} key={sw.name}>
          <FormControlLabel
            control={
              <Switch
                name={sw.name}
                checked={!!values[sw.name]}
                onChange={(e) => (onSwitchChange || onChange)?.(sw.name, e.target.checked)}
                color="primary"
                disabled={sw.disabled}
              />
            }
            label={
              sw.mobileLabel ? (
                <Box component="span">
                  <Box
                    component="span"
                    sx={{ display: { xs: "none", sm: "inline" } }}
                  >
                    {sw.label}
                  </Box>
                  <Box component="span" sx={{ display: { sm: "none" } }}>
                    {sw.mobileLabel}
                  </Box>
                </Box>
              ) : (
                sw.label || ""
              )
            }
          />
        </Grid>
      ))}
    </Grid>
  );
}

FieldsComponent.displayName = "FieldsComponent";
