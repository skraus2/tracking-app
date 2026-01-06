import { PrismaClient, UserRole, UserAccess, Track17MainStatus, Track17SubStatus, ShopifyStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const user = await prisma.user.upsert({
    where: { email: "simon.kraus00@gmail.com" },
    update: {
      name: "Simon Kraus",
      role: UserRole.Admin,
      access: UserAccess.Enabled,
    },
    create: {
      id: crypto.randomUUID(),
      email: "simon.kraus00@gmail.com",
      name: "Simon Kraus",
      role: UserRole.Admin,
      access: UserAccess.Enabled,
      emailVerified: false,
    },
  });

  console.log("Seeded user:", user);

  // Create status mappings (from settings page initial values)
  const statusMappings = [
    { mainStatus: Track17MainStatus.NotFound, subStatus: Track17SubStatus.NotFound_Other, shopifyStatus: ShopifyStatus.LABEL_PURCHASED },
    { mainStatus: Track17MainStatus.NotFound, subStatus: Track17SubStatus.NotFound_InvalidCode, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.InfoReceived, subStatus: Track17SubStatus.InfoReceived, shopifyStatus: ShopifyStatus.CONFIRMED },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_PickedUp, shopifyStatus: ShopifyStatus.CARRIER_PICKED_UP },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_Other, shopifyStatus: ShopifyStatus.IN_TRANSIT },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_Departure, shopifyStatus: ShopifyStatus.IN_TRANSIT },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_Arrival, shopifyStatus: ShopifyStatus.IN_TRANSIT },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_CustomsProcessing, shopifyStatus: ShopifyStatus.IN_TRANSIT },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_CustomsReleased, shopifyStatus: ShopifyStatus.IN_TRANSIT },
    { mainStatus: Track17MainStatus.InTransit, subStatus: Track17SubStatus.InTransit_CustomsRequiringInformation, shopifyStatus: ShopifyStatus.DELAYED },
    { mainStatus: Track17MainStatus.Expired, subStatus: Track17SubStatus.Expired_Other, shopifyStatus: ShopifyStatus.DELAYED },
    { mainStatus: Track17MainStatus.AvailableForPickup, subStatus: Track17SubStatus.AvailableForPickup_Other, shopifyStatus: ShopifyStatus.READY_FOR_PICKUP },
    { mainStatus: Track17MainStatus.OutForDelivery, subStatus: Track17SubStatus.OutForDelivery_Other, shopifyStatus: ShopifyStatus.OUT_FOR_DELIVERY },
    { mainStatus: Track17MainStatus.DeliveryFailure, subStatus: Track17SubStatus.DeliveryFailure_Other, shopifyStatus: ShopifyStatus.ATTEMPTED_DELIVERY },
    { mainStatus: Track17MainStatus.DeliveryFailure, subStatus: Track17SubStatus.DeliveryFailure_NoBody, shopifyStatus: ShopifyStatus.ATTEMPTED_DELIVERY },
    { mainStatus: Track17MainStatus.DeliveryFailure, subStatus: Track17SubStatus.DeliveryFailure_Security, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.DeliveryFailure, subStatus: Track17SubStatus.DeliveryFailure_Rejected, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.DeliveryFailure, subStatus: Track17SubStatus.DeliveryFailure_InvalidAddress, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Delivered, subStatus: Track17SubStatus.Delivered_Other, shopifyStatus: ShopifyStatus.DELIVERED },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Other, shopifyStatus: ShopifyStatus.DELAYED },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Returning, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Returned, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_NoBody, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Security, shopifyStatus: ShopifyStatus.ATTEMPTED_DELIVERY },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Damage, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Rejected, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Delayed, shopifyStatus: ShopifyStatus.DELAYED },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Lost, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Destroyed, shopifyStatus: ShopifyStatus.FAILURE },
    { mainStatus: Track17MainStatus.Exception, subStatus: Track17SubStatus.Exception_Cancel, shopifyStatus: ShopifyStatus.FAILURE },
  ];

  // Create fallback mappings (only main status, no sub status)
  // These are used when a specific sub-status mapping doesn't exist
  const fallbackMappings = [
    { mainStatus: Track17MainStatus.NotFound, subStatus: null, shopifyStatus: ShopifyStatus.LABEL_PURCHASED },
    { mainStatus: Track17MainStatus.InfoReceived, subStatus: null, shopifyStatus: ShopifyStatus.CONFIRMED },
    { mainStatus: Track17MainStatus.InTransit, subStatus: null, shopifyStatus: ShopifyStatus.IN_TRANSIT },
    { mainStatus: Track17MainStatus.Expired, subStatus: null, shopifyStatus: ShopifyStatus.DELAYED },
    { mainStatus: Track17MainStatus.AvailableForPickup, subStatus: null, shopifyStatus: ShopifyStatus.READY_FOR_PICKUP },
    { mainStatus: Track17MainStatus.OutForDelivery, subStatus: null, shopifyStatus: ShopifyStatus.OUT_FOR_DELIVERY },
    { mainStatus: Track17MainStatus.DeliveryFailure, subStatus: null, shopifyStatus: ShopifyStatus.ATTEMPTED_DELIVERY },
    { mainStatus: Track17MainStatus.Delivered, subStatus: null, shopifyStatus: ShopifyStatus.DELIVERED },
    { mainStatus: Track17MainStatus.Exception, subStatus: null, shopifyStatus: ShopifyStatus.DELAYED },
  ];

  for (const mapping of statusMappings) {
    await prisma.statusMapping.upsert({
      where: {
        track17Status_track17SubStatus: {
          track17Status: mapping.mainStatus,
          track17SubStatus: mapping.subStatus,
        },
      },
      update: {
        shopifyStatus: mapping.shopifyStatus,
      },
      create: {
        track17Status: mapping.mainStatus,
        track17SubStatus: mapping.subStatus,
        shopifyStatus: mapping.shopifyStatus,
      },
    });
  }

  // Create fallback mappings (with null subStatus, need to use findFirst + create/update)
  for (const mapping of fallbackMappings) {
    const existing = await prisma.statusMapping.findFirst({
      where: {
        track17Status: mapping.mainStatus,
        track17SubStatus: null,
      },
    });

    if (existing) {
      await prisma.statusMapping.update({
        where: { id: existing.id },
        data: {
          shopifyStatus: mapping.shopifyStatus,
        },
      });
    } else {
      await prisma.statusMapping.create({
        data: {
          track17Status: mapping.mainStatus,
          track17SubStatus: null,
          shopifyStatus: mapping.shopifyStatus,
        },
      });
    }
  }

  console.log(`Seeded ${statusMappings.length} specific status mappings and ${fallbackMappings.length} fallback mappings`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

