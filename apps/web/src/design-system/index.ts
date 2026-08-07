/**
 * Design system do LatexBookBank — portado do Edulingo DS Admin v1 (D13).
 *
 * Cada componente carrega o próprio CSS via `injectCss`, escrito em `var(--token)`. Sem Tailwind,
 * sem CSS-in-JS, sem build step: é o que permitiu adotar o DS inteiro sem trazer um segundo
 * sistema de estilo junto.
 */

export { Icon, ICON_NAMES, type IconName, type IconProps } from "./Icon";

export { Button, type ButtonProps, type ButtonVariant, type ControlSize } from "./forms/Button";
export { IconButton, type IconButtonProps } from "./forms/IconButton";
export { Input, type InputProps } from "./forms/Input";
export { Field, type FieldProps } from "./forms/Field";
export { Select, type SelectProps } from "./forms/Select";
export { Checkbox, type CheckboxProps } from "./forms/Checkbox";
export { Toggle, type ToggleProps } from "./forms/Toggle";

export { Badge, BADGE_TONES, type BadgeProps, type BadgeTone } from "./display/Badge";
export { StatusDot, type StatusDotProps, type StatusTone } from "./display/StatusDot";
export { Chip, type ChipProps } from "./display/Chip";
export { MetricCard, type MetricCardProps } from "./display/MetricCard";
export {
  ArtifactStatus,
  ARTIFACT_STATES,
  canApplyPatch,
  type ArtifactStatusId,
  type ArtifactStatusProps,
} from "./display/ArtifactStatus";

export { EmptyState, type EmptyStateProps } from "./feedback/EmptyState";
export { Callout, type CalloutProps, type CalloutTone } from "./feedback/Callout";
