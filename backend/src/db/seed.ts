import { eq } from 'drizzle-orm';
import {
  OnboardingStep,
  RestaurantRole,
  RestaurantStatus,
  UserRole,
  WhatsAppStatus,
  slugify,
} from '@nayaro/shared';
import { closeDatabase, db } from './client.js';
import {
  categories,
  deliveryZones,
  foodItems,
  restaurantSettings,
  restaurantUsers,
  restaurants,
  users,
} from './schema/index.js';
import { hashPassword } from '../lib/password.js';

/**
 * Development seed: one Super Admin plus three demo restaurants with
 * deliberately different delivery policies, so the zone engine is exercised
 * from the very first page load.
 *
 * Idempotent — re-running updates nothing and inserts nothing that already
 * exists, so it is safe to call repeatedly while developing.
 */

const DEMO_PASSWORD = 'nayaro-demo-2026';

/** Real Kathmandu coordinates, so map previews and distances look sensible. */
const DEMO_RESTAURANTS = [
  {
    name: 'Hotel Everest Momo',
    description:
      'Steamed and fried momo, Newari thali and Himalayan comfort food, served in Thamel since 2009.',
    address: 'Thamel Marg, Kathmandu',
    latitude: 27.7154,
    longitude: 85.3123,
    phone: '+9779801000001',
    whatsapp: '+9779801000001',
    // 0-5 free, 5-10 Rs.10, 10-20 Rs.50 — the exact example from the brief.
    zones: [
      { min: 0, max: 5, fee: '0.00' },
      { min: 5, max: 10, fee: '10.00' },
      { min: 10, max: 20, fee: '50.00' },
    ],
    menu: [
      {
        category: 'Momo',
        items: [
          { name: 'Chicken Momo', price: '90.00', description: 'Ten steamed dumplings with tomato achar.', prep: 20 },
          { name: 'Buff Momo', price: '80.00', description: 'Classic Kathmandu buffalo momo.', prep: 20 },
          { name: 'Chilli Momo', price: '140.00', description: 'Fried momo tossed in a hot garlic sauce.', prep: 25 },
          { name: 'Veg Momo', price: '70.00', description: 'Cabbage, carrot and paneer.', prep: 18 },
        ],
      },
      {
        category: 'Thali',
        items: [
          { name: 'Newari Khaja Set', price: '320.00', description: 'Chiura, choila, bhatmas and aloo.', prep: 30 },
          { name: 'Veg Thali', price: '250.00', description: 'Dal, bhat, tarkari, achar and papad.', prep: 25 },
        ],
      },
      {
        category: 'Drinks',
        items: [
          { name: 'Coke', price: '60.00', description: 'Chilled 250 ml bottle.', prep: 1 },
          { name: 'Masala Tea', price: '40.00', description: 'Brewed with fresh ginger and cardamom.', prep: 8 },
        ],
      },
    ],
  },
  {
    name: 'Patan Pizza House',
    description: 'Wood-fired pizza and pasta a few steps from Patan Durbar Square.',
    address: 'Mangal Bazar, Lalitpur',
    latitude: 27.6766,
    longitude: 85.325,
    phone: '+9779801000002',
    whatsapp: '+9779801000002',
    zones: [
      { min: 0, max: 3, fee: '0.00' },
      { min: 3, max: 8, fee: '30.00' },
      { min: 8, max: 15, fee: '70.00' },
    ],
    menu: [
      {
        category: 'Pizza',
        items: [
          { name: 'Margherita', price: '450.00', description: 'San Marzano tomato, mozzarella, basil.', prep: 20 },
          { name: 'Pepperoni', price: '620.00', description: 'Double pepperoni and oregano.', prep: 22 },
          { name: 'Paneer Tikka Pizza', price: '580.00', description: 'Spiced paneer, onion and capsicum.', prep: 22 },
        ],
      },
      {
        category: 'Pasta',
        items: [
          { name: 'Penne Arrabbiata', price: '390.00', description: 'Garlic, chilli and tomato.', prep: 18 },
          { name: 'Chicken Alfredo', price: '480.00', description: 'Cream, parmesan and grilled chicken.', prep: 20 },
        ],
      },
      {
        category: 'Drinks',
        items: [{ name: 'Fresh Lime Soda', price: '120.00', description: 'Sweet or salted.', prep: 5 }],
      },
    ],
  },
  {
    name: 'Boudha Burger Club',
    description: 'Smash burgers, loaded fries and thick shakes near Boudhanath Stupa.',
    address: 'Boudha Sadak, Kathmandu',
    latitude: 27.7215,
    longitude: 85.3618,
    phone: '+9779801000003',
    // Deliberately left unverified, to exercise the "cannot receive orders" path.
    whatsapp: null,
    zones: [{ min: 0, max: 10, fee: '20.00' }],
    menu: [
      {
        category: 'Burger',
        items: [
          { name: 'Classic Smash', price: '380.00', description: 'Single patty, cheddar, pickles.', prep: 15 },
          { name: 'Double Trouble', price: '540.00', description: 'Two patties and smoked sauce.', prep: 18 },
          { name: 'Crispy Chicken Burger', price: '420.00', description: 'Buttermilk fried chicken thigh.', prep: 18 },
        ],
      },
      {
        category: 'Sides',
        items: [
          { name: 'Loaded Fries', price: '260.00', description: 'Cheese sauce, jalapeño, spring onion.', prep: 12 },
          { name: 'Onion Rings', price: '180.00', description: 'Six beer-battered rings.', prep: 10 },
        ],
      },
      {
        category: 'Drinks',
        items: [{ name: 'Chocolate Shake', price: '280.00', description: 'Thick, with real cocoa.', prep: 6 }],
      },
    ],
  },
] as const;

async function seedSuperAdmin(): Promise<void> {
  const email = 'admin@nayaro.tech';
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.log(`  · Super Admin ${email} already exists`);
    return;
  }
  await db.insert(users).values({
    email,
    name: 'Nayaro Tech Admin',
    phone: '+9779800000000',
    passwordHash: await hashPassword(DEMO_PASSWORD),
    role: UserRole.SUPER_ADMIN,
  });
  console.log(`  ✓ Super Admin ${email}`);
}

async function seedRestaurant(demo: (typeof DEMO_RESTAURANTS)[number], index: number): Promise<void> {
  const slug = slugify(demo.name);
  const existing = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.slug, slug))
    .limit(1);
  if (existing.length > 0) {
    console.log(`  · ${demo.name} already exists`);
    return;
  }

  // One transaction per restaurant: a demo tenant is either complete or absent.
  await db.transaction(async (tx) => {
    const ownerEmail = `owner${index + 1}@nayaro.tech`;
    const [userResult] = await tx.insert(users).values({
      email: ownerEmail,
      name: `${demo.name} Owner`,
      phone: demo.phone,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      role: UserRole.RESTAURANT_ADMIN,
    });

    const [restaurantResult] = await tx.insert(restaurants).values({
      slug,
      name: demo.name,
      description: demo.description,
      phone: demo.phone,
      email: ownerEmail,
      address: demo.address,
      latitude: demo.latitude,
      longitude: demo.longitude,
      status: RestaurantStatus.ACTIVE,
      onboardingStep: OnboardingStep.DONE,
    });

    const restaurantId = restaurantResult.insertId;

    await tx.insert(restaurantUsers).values({
      restaurantId,
      userId: userResult.insertId,
      role: RestaurantRole.OWNER,
    });

    await tx.insert(restaurantSettings).values({
      restaurantId,
      whatsappNumber: demo.whatsapp,
      whatsappStatus: demo.whatsapp ? WhatsAppStatus.VERIFIED : WhatsAppStatus.UNVERIFIED,
      whatsappVerifiedAt: demo.whatsapp ? new Date() : null,
    });

    await tx.insert(deliveryZones).values(
      demo.zones.map((zone) => ({
        restaurantId,
        minDistanceKm: zone.min,
        maxDistanceKm: zone.max,
        deliveryFee: zone.fee,
      })),
    );

    for (const [categoryIndex, group] of demo.menu.entries()) {
      const [categoryResult] = await tx.insert(categories).values({
        restaurantId,
        name: group.category,
        slug: slugify(group.category),
        sortOrder: categoryIndex,
      });

      await tx.insert(foodItems).values(
        group.items.map((item, itemIndex) => ({
          restaurantId,
          categoryId: categoryResult.insertId,
          name: item.name,
          slug: slugify(item.name),
          description: item.description,
          price: item.price,
          prepTimeMinutes: item.prep,
          sortOrder: itemIndex,
        })),
      );
    }
  });

  console.log(`  ✓ ${demo.name} (${demo.zones.length} zones, ${demo.menu.length} categories)`);
}

async function main(): Promise<void> {
  console.log('Seeding development data…');
  await seedSuperAdmin();
  for (const [index, demo] of DEMO_RESTAURANTS.entries()) {
    await seedRestaurant(demo, index);
  }
  console.log(`\nDone. Every demo account uses the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
