"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Input } from "@/components/ui/input";

type CompanyOption = {
  id: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
};

type Labels = {
  searchPlaceholder: string;
  company: string;
  allCompanies: string;
  department: string;
  anyDepartment: string;
  status: string;
  allStatus: string;
  active: string;
  inactive: string;
  apply: string;
  reset: string;
};

type Props = {
  q: string;
  companyId: string;
  departmentId: string;
  active: "all" | "active" | "inactive";
  companies: CompanyOption[];
  departments: DepartmentOption[];
  labels: Labels;
};

export function StaffDirectoryFilters({ q, companyId: initialCompanyId, departmentId: initialDepartmentId, active, companies, departments, labels }: Props) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);

  useEffect(() => {
    if (!departmentId) return;
    const stillValid = departments.some((department) => department.id === departmentId && (!companyId || department.companyId === companyId));
    if (!stillValid) setDepartmentId("");
  }, [companyId, departmentId, departments]);

  const visibleDepartments = companyId ? departments.filter((department) => department.companyId === companyId) : departments;

  return (
    <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-4">
      <form action="/staff" method="get" className="space-y-3">
        <Input
          name="q"
          defaultValue={q}
          placeholder={labels.searchPlaceholder}
          className="h-11 rounded-[10px] border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm shadow-sm"
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{labels.company}</label>
            <select
              name="companyId"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"
            >
              <option value="">{labels.allCompanies}</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{labels.department}</label>
            <select
              name="departmentId"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-10 w-full rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"
            >
              <option value="">{labels.anyDepartment}</option>
              {visibleDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {companyId ? department.name : `${department.companyName} / ${department.name}`}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[hsl(var(--muted))]">{labels.status}</label>
            <select
              name="active"
              defaultValue={active}
              className="h-10 w-full rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm"
            >
              <option value="all">{labels.allStatus}</option>
              <option value="active">{labels.active}</option>
              <option value="inactive">{labels.inactive}</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FormSubmitButton type="submit" variant="secondary" className="h-9 rounded-[10px]" pendingLabel={labels.apply}>
            {labels.apply}
          </FormSubmitButton>
          <Link href="/staff" className="inline-flex h-9 items-center text-sm text-[hsl(var(--muted))] underline">
            {labels.reset}
          </Link>
        </div>
      </form>
    </div>
  );
}
