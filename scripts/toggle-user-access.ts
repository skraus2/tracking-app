import { PrismaClient, UserAccess } from "@prisma/client";

const prisma = new PrismaClient();

async function toggleUserAccess() {
  const email = process.argv[2] || "simon.kraus00@gmail.com";
  const accessStatus = process.argv[3] as "enabled" | "disabled" | undefined;

  try {
    // Get current user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    // Determine new access status
    let newAccess: UserAccess;
    if (accessStatus) {
      newAccess = accessStatus === "enabled" ? UserAccess.Enabled : UserAccess.Disabled;
    } else {
      // Toggle current status
      newAccess = user.access === UserAccess.Enabled ? UserAccess.Disabled : UserAccess.Enabled;
    }

    // Update user access
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { access: newAccess },
    });

    console.log(`✅ User access updated:`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Name: ${updatedUser.name}`);
    console.log(`   Access: ${updatedUser.access}`);
    console.log(`\n📝 To test:`);
    console.log(`   1. Try to login with this email`);
    console.log(`   2. If access is Disabled, you should see "Access denied" error`);
    console.log(`   3. If access is Enabled, login should work normally`);
  } catch (error) {
    console.error("❌ Error updating user access:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

toggleUserAccess();

