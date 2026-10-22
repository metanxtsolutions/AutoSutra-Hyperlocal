/** Client-safe option lists and labels. */

export const VEHICLE_CATEGORY_OPTIONS = [
  { value: "passenger_cars", label: "Passenger cars" },
  { value: "two_wheelers", label: "Two-wheelers" },
  { value: "commercial_vehicles", label: "Commercial vehicles" },
  { value: "electric_vehicles", label: "Electric vehicles" },
  { value: "multi_category", label: "Multiple categories" },
] as const;

export const DEALERSHIP_TYPE_OPTIONS = [
  { value: "new_vehicle", label: "New vehicle dealership" },
  { value: "pre_owned", label: "Pre-owned vehicles" },
  { value: "service_centre", label: "Service centre / workshop" },
  { value: "multi_format", label: "Sales, service and pre-owned" },
] as const;

export const LOCATION_KIND_OPTIONS = [
  { value: "showroom", label: "Showroom" },
  { value: "service_centre", label: "Service centre" },
  { value: "pre_owned_outlet", label: "Pre-owned outlet" },
  { value: "workshop", label: "Workshop" },
  { value: "experience_centre", label: "Experience centre" },
] as const;

export const ORG_TYPE_OPTIONS = [
  { value: "independent_dealership", label: "Independent dealership" },
  { value: "dealer_group", label: "Dealer group (multiple dealerships or locations)" },
  { value: "agency", label: "Automotive marketing agency" },
] as const;

export const ROLE_OPTIONS = [
  { value: "owner", label: "Organisation Owner" },
  { value: "admin", label: "Organisation Admin" },
  { value: "marketing_manager", label: "Marketing Manager" },
  { value: "branch_manager", label: "Branch Manager" },
  { value: "sales_user", label: "Sales User" },
  { value: "finance_user", label: "Finance User" },
  { value: "analyst", label: "Read-only Analyst" },
] as const;

export function labelFor(options: readonly { value: string; label: string }[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? (value ? value.replace(/_/g, " ") : "–");
}
