"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isCompanyAdmin, isGroupAdmin, isSuperAdmin, type AccessUser } from "@/lib/access";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function req(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

async function assertCompanyDeptManage(user: AccessUser, companyId: string) {
  await assertPermission(user, "company.update");
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new Error("Company not found");
  if (!isSuperAdmin(user) && !isGroupAdmin(user, company.orgGroupId) && !isCompanyAdmin(user, companyId)) {
    throw new Error("Forbidden");
  }
  return company;
}

export async function createDepartmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const companyId = req(formData, "companyId");
  await assertCompanyDeptManage(user, companyId);
  const name = req(formData, "name");
  const maxSort = await prisma.department.aggregate({
    where: { companyId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  await prisma.department.create({ data: { companyId, name, sortOrder } });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/staff");
  revalidatePath("/projects");
}

export async function updateDepartmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const id = req(formData, "departmentId");
  const name = req(formData, "name");
  const dep = await prisma.department.findFirst({ where: { id } });
  if (!dep) throw new Error("Department not found");
  await assertCompanyDeptManage(user, dep.companyId);
  await prisma.department.update({ where: { id }, data: { name } });
  revalidatePath(`/companies/${dep.companyId}`);
  revalidatePath("/staff");
  revalidatePath("/projects");
}

export async function deleteDepartmentAction(formData: FormData) {
  const user = (await requireUser()) as AccessUser;
  const id = req(formData, "departmentId");
  const dep = await prisma.department.findFirst({ where: { id } });
  if (!dep) throw new Error("Department not found");
  await assertCompanyDeptManage(user, dep.companyId);
  await prisma.department.delete({ where: { id } });
  revalidatePath(`/companies/${dep.companyId}`);
  revalidatePath("/staff");
  revalidatePath("/projects");
}
