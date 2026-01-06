import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function toggleUserRole() {
  const email = process.argv[2] || "simon.kraus00@gmail.com";
  const roleStatus = process.argv[3] as "admin" | "customer" | undefined;

  try {
    // Get current user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    // Determine new role
    let newRole: UserRole;
    if (roleStatus) {
      newRole = roleStatus === "admin" ? UserRole.Admin : UserRole.Customer;
    } else {
      // Toggle current role
      newRole = user.role === UserRole.Admin ? UserRole.Customer : UserRole.Admin;
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role: newRole },
    });

    console.log(`✅ User role updated:`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Name: ${updatedUser.name}`);
    console.log(`   Role: ${updatedUser.role}`);
    console.log(`\n📝 To test:`);
    console.log(`   1. Login with this user`);
    console.log(`   2. Admin users can access all features`);
    console.log(`   3. Customer users have limited access`);
    console.log(`   4. Check API routes that require Admin role`);
  } catch (error) {
    console.error("❌ Error updating user role:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

toggleUserRole();

