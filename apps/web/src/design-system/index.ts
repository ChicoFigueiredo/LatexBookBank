/**
 * Design system do LatexBookBank — portado do Edulingo DS Admin v1 (D13).
 *
 * Cada componente carrega o próprio CSS via `injectCss`, escrito em `var(--token)`. Sem Tailwind,
 * sem CSS-in-JS, sem build step: é o que permitiu adotar o DS inteiro sem trazer um segundo
 * sistema de estilo junto.
 */

export { Icon, ICON_NAMES, type IconName, type IconProps } from "./Icon";
export { BrandMark, type BrandMarkProps, type BrandTone } from "./BrandMark";

export { Button, type ButtonProps, type ButtonVariant, type ControlSize } from "./forms/Button";
export { IconButton, type IconButtonProps } from "./forms/IconButton";
export { Input, type InputProps } from "./forms/Input";
export { Field, type FieldProps } from "./forms/Field";
export { Select, type SelectProps } from "./forms/Select";
export { Checkbox, type CheckboxProps } from "./forms/Checkbox";
export { Toggle, type ToggleProps } from "./forms/Toggle";
export { Combobox, type ComboboxProps, type ComboboxOption } from "./forms/Combobox";

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
export { Banner, type BannerProps, type BannerTone } from "./feedback/Banner";
export { Modal, type ModalProps } from "./feedback/Modal";
export {
  Toast,
  ToastViewport,
  useToasts,
  type ToastProps,
  type ToastTone,
  type ToastRequest,
  type ToastController,
  type ToastViewportProps,
} from "./feedback/Toast";

export { Tabs, type TabsProps, type TabItem } from "./navigation/Tabs";
export { Segmented, type SegmentedProps, type SegmentedOption } from "./navigation/Segmented";
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from "./navigation/Breadcrumb";
export { PageHeader, type PageHeaderProps } from "./navigation/PageHeader";
export { Tree, type TreeProps, type TreeNode } from "./navigation/Tree";

export { Workbench, type WorkbenchProps, type WorkbenchModule } from "./shell/Workbench";
export { Divider, type DividerProps } from "./shell/Divider";
export { CommandPalette, type CommandPaletteProps, type Command } from "./shell/CommandPalette";

export { Tooltip, TooltipProvider, type TooltipProps } from "./overlays/Tooltip";
export { Popover, type PopoverProps } from "./overlays/Popover";
export { ContextMenu, type ContextMenuProps, type ContextMenuItem } from "./overlays/ContextMenu";
