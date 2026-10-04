import { c, type DepartmentSpec } from './spec.js';

// prettier-ignore
export const HARDLINES: readonly DepartmentSpec[] = [
  {
    slug: 'electronics', name: 'Electronics', taxable: true,
    description: 'TVs, laptops, audio and smart home.',
    brands: ['Voltra', 'Lumenix', 'Northwave', 'Ampere & Co'],
    categories: [
      c('tvs', 'TVs', [199, 1899], 'none', ['4K TV', 'OLED TV', 'Smart TV', 'QLED TV']),
      c('laptops', 'Laptops', [399, 2499], 'capacity', ['Laptop', 'Ultrabook', '2-in-1 Laptop', 'Chromebook']),
      c('headphones', 'Headphones', [19, 449], 'color', ['Wireless Earbuds', 'Over-Ear Headphones', 'Sport Earphones', 'Noise-Cancelling Headphones']),
      c('smart-home', 'Smart Home', [19, 299], 'none', ['Smart Speaker', 'Video Doorbell', 'Smart Plug', 'Smart Thermostat', 'Security Camera']),
      c('cameras', 'Cameras', [99, 1999], 'none', ['Mirrorless Camera', 'Action Camera', 'Instant Camera', 'Camera Lens']),
      c('phone-accessories', 'Phone Accessories', [9, 99], 'color', ['Phone Case', 'Charging Stand', 'Power Bank', 'USB-C Cable']),
    ],
  },
  {
    slug: 'home-kitchen', name: 'Home & Kitchen', taxable: true,
    description: 'Cookware, appliances, bedding and furniture.',
    brands: ['Hearthly', 'Oak & Iron', 'Casa Clara', 'Kettleby'],
    categories: [
      c('cookware', 'Cookware', [19, 349], 'none', ['Skillet', 'Dutch Oven', 'Saucepan Set', 'Sheet Pan', 'Wok']),
      c('small-appliances', 'Small Appliances', [29, 499], 'color', ['Air Fryer', 'Blender', 'Coffee Maker', 'Stand Mixer', 'Toaster']),
      c('bedding', 'Bedding', [24, 299], 'capacity', ['Sheet Set', 'Duvet Cover', 'Pillow', 'Weighted Blanket', 'Quilt']),
      c('furniture', 'Furniture', [79, 1299], 'color', ['Accent Chair', 'Bookshelf', 'Coffee Table', 'Desk', 'Nightstand']),
      c('storage', 'Storage', [9, 149], 'none', ['Storage Bin', 'Shoe Rack', 'Closet Organizer', 'Pantry Container Set']),
    ],
  },
  {
    slug: 'toys-games', name: 'Toys & Games', taxable: true,
    description: 'Building sets, games, puzzles and outdoor play.',
    brands: ['Brickhaven', 'Playwise', 'Tumble Toys'],
    categories: [
      c('building-sets', 'Building Sets', [14, 199], 'none', ['Castle Building Set', 'Space Station Set', 'City Builder Kit', 'Robot Kit']),
      c('board-games', 'Board Games', [14, 79], 'none', ['Strategy Game', 'Party Game', 'Family Board Game', 'Cooperative Game']),
      c('puzzles', 'Puzzles', [9, 49], 'none', ['1000-Piece Puzzle', '500-Piece Puzzle', '3D Puzzle', 'Kids Floor Puzzle']),
      c('outdoor-play', 'Outdoor Play', [19, 399], 'color', ['Scooter', 'Water Blaster', 'Swing Set', 'Kite']),
      c('dolls-figures', 'Dolls & Figures', [9, 89], 'none', ['Action Figure', 'Fashion Doll', 'Plush Toy', 'Dollhouse']),
    ],
  },
  {
    slug: 'sports-outdoors', name: 'Sports & Outdoors', taxable: true,
    description: 'Fitness, camping, cycling and team sports.',
    brands: ['Summit Gear', 'Pulse Fitness', 'Trailcraft'],
    categories: [
      c('fitness', 'Fitness', [14, 899], 'none', ['Yoga Mat', 'Adjustable Dumbbells', 'Resistance Bands', 'Exercise Bike']),
      c('camping', 'Camping', [19, 499], 'color', ['Tent', 'Sleeping Bag', 'Camp Stove', 'Headlamp', 'Backpack']),
      c('cycling', 'Cycling', [19, 1299], 'none', ['Road Bike', 'Bike Helmet', 'Bike Lock', 'Bike Light Set']),
      c('team-sports', 'Team Sports', [12, 149], 'none', ['Soccer Ball', 'Basketball', 'Baseball Glove', 'Hockey Stick']),
    ],
  },
];
