import type { ChromeContent, HomeContent, SitePageInput } from '@nayaro/shared';

/**
 * What the public site shows before a Super Admin has edited anything. Saved
 * content replaces these wholesale; they are never merged field by field, so
 * clearing a field in the editor really clears it.
 */

export const DEFAULT_HOME: HomeContent = {
  hero: {
    badge: 'Now in Nepal.',
    titleStart: 'Know the fee',
    titleHighlight: 'before',
    titleEnd: 'you order.',
    subtitle:
      'Order from restaurants near you, pay cash at your door, and follow your order live — from the kitchen to your door.',
  },
  photos: [
    { url: '/images/home/handoff.jpg', alt: 'A smiling customer receiving a food delivery at her door', label: '' },
    { url: '/images/home/momo.jpg', alt: 'A plate of steamed momo with tomato achar', label: 'Momo' },
    { url: '/images/home/pizza.jpg', alt: 'A cheese pizza with cherry tomatoes', label: 'Pizza' },
    { url: '/images/home/burger.jpg', alt: 'A burger with lettuce and tomato', label: 'Burgers' },
  ],
  heroCaption: {
    title: 'Hot food, at your door',
    body: 'Every restaurant sets its own delivery fee — you see yours before you order.',
  },
  sections: [
    {
      id: 'how-it-works',
      type: 'features',
      title: 'How it works',
      subtitle: 'From craving to doorstep in three steps.',
      items: [
        { icon: 'map-pin', title: 'Share your location', text: 'See which restaurants deliver to you and what delivery costs.' },
        { icon: 'wallet', title: 'Pay cash on delivery', text: 'Order in a minute with your account. Pay when the food arrives.' },
        { icon: 'bike', title: 'Track it live', text: 'Follow every step, from the kitchen to your door.' },
      ],
    },
    {
      id: 'for-restaurants',
      type: 'cta',
      title: 'Run a restaurant?',
      body: 'List your kitchen for free, set your own delivery fees, and get orders live on your phone.',
      buttonLabel: 'List your restaurant',
      buttonHref: '/register',
    },
  ],
};

export const DEFAULT_CHROME: ChromeContent = {
  headerLinks: [{ label: 'About', href: '/about' }],
  footer: {
    tagline: 'Food from local kitchens, with the delivery fee shown before you order.',
    columns: [
      {
        title: 'Order',
        links: [
          { label: 'Browse restaurants', href: '/' },
          { label: 'Track an order', href: '/orders' },
        ],
      },
      {
        title: 'Restaurants',
        links: [
          { label: 'List your restaurant', href: '/register' },
          { label: 'Restaurant sign in', href: '/login' },
        ],
      },
    ],
    contact: { email: 'support@nayaro.tech', phone: '', address: 'Urlabari, Nepal' },
    social: { facebook: '', instagram: '', tiktok: '', youtube: '' },
    copyright: 'Nayaro Tech',
  },
};

export const DEFAULT_PAGES: SitePageInput[] = [
  {
    slug: 'about',
    title: 'About us',
    summary: 'Nayaro Food connects hungry people with the kitchens around them.',
    body: `Nayaro Food is a food-delivery platform built by **Nayaro Tech** for local restaurants in Nepal.

## What makes us different

- **The delivery fee is shown before you order.** Each restaurant sets its own fee by distance, and we calculate yours from your actual location.
- **Simple ordering.** Create an account once, then order in a minute and pay cash at your door.
- **Live tracking.** Every order gets a tracking code so you can follow it from the kitchen to your door.

## For restaurants

Restaurants list themselves for free, build their own menu, set their own delivery zones, and receive orders live on their dashboard and phone.

[List your restaurant](/register)`,
    showContactForm: false,
    isPublished: true,
    showInFooter: true,
    sortOrder: 0,
  },
  {
    slug: 'contact',
    title: 'Contact us',
    summary: 'Questions about an order, or about listing your restaurant? We’re here to help.',
    body: `For anything about an order — late, wrong or missing items — the fastest route is to **call the restaurant** using the button on your tracking page.

For everything else, send us a message below and we’ll get back to you.`,
    showContactForm: true,
    isPublished: true,
    showInFooter: true,
    sortOrder: 1,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    summary: 'What we collect, why, and what we do with it.',
    body: `This policy explains how Nayaro Tech ("we") handles personal information on Nayaro Food.

## What we collect

- **When you order:** your name, phone number, optional email, delivery address and landmark, the location pin you share, your order and any note you add.
- **When you register a restaurant:** the owner's name, email, phone and password (stored only as a secure hash), and the restaurant's business details.
- **When you contact us:** what you write in the contact form.
- **Technical data:** IP address and browser type, used to keep the service secure and prevent abuse.

## Why we use it

- To send your order to the restaurant and let them deliver it and contact you about it.
- To calculate the delivery distance and fee from your location.
- To let you track your order.
- To keep the platform secure and investigate misuse.

## Who we share it with

Your order details — including your name, phone and address — go **only to the restaurant you order from**, so they can prepare and deliver it. We do not sell personal information.

## On your device

Your cart, the details you ask us to remember, and your recent tracking codes are stored in your own browser. You can clear them at any time by clearing your browser's site data.

## How long we keep it

Order records are kept for as long as needed for accounting and dispute resolution. You can ask us to delete your personal details where we are not required to keep them.

## Your choices

You can ask what we hold about you, ask us to correct it, or ask us to delete it by contacting us through the [contact page](/contact).

## Changes

We will update this page if our practices change.`,
    showContactForm: false,
    isPublished: true,
    showInFooter: true,
    sortOrder: 2,
  },
  {
    slug: 'terms',
    title: 'Terms of service',
    summary: 'The rules for using Nayaro Food.',
    body: `By using Nayaro Food you agree to these terms.

## Orders

- Your order is a contract between you and the **restaurant**. Nayaro Food passes the order on and shows its status.
- Prices and delivery fees are set by each restaurant. The total shown at checkout is what you pay.
- Payment is cash on delivery unless stated otherwise.
- You can cancel an order until the restaurant accepts it. After that, contact the restaurant.

## Restaurants

- Restaurants must provide accurate business details, menus and prices, and fulfil the orders they accept.
- We may verify, deactivate or block a restaurant that breaks these terms or receives repeated complaints.

## Acceptable use

Do not place fake orders, misuse other people's details, or attempt to disrupt the service.

## Liability

Restaurants are responsible for the food they prepare and deliver. Nayaro Tech is responsible for operating the platform with reasonable care.

## Contact

Questions about these terms? [Contact us](/contact).`,
    showContactForm: false,
    isPublished: true,
    showInFooter: true,
    sortOrder: 3,
  },
];
