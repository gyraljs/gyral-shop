import { c, type DepartmentSpec } from './spec.js';

// prettier-ignore
export const CONSUMABLES: readonly DepartmentSpec[] = [
  {
    slug: 'grocery', name: 'Grocery', taxable: false,
    description: 'Pantry staples, snacks, drinks, coffee and tea.',
    brands: ['Good Field', 'Harvest Row', 'Bean & Leaf'],
    categories: [
      c('snacks', 'Snacks', [2, 15], 'capacity', ['Trail Mix', 'Tortilla Chips', 'Granola Bars', 'Dark Chocolate', 'Pretzels']),
      c('beverages', 'Beverages', [2, 25], 'capacity', ['Sparkling Water', 'Cold Brew', 'Orange Juice', 'Kombucha']),
      c('pantry', 'Pantry', [2, 19], 'capacity', ['Olive Oil', 'Pasta', 'Basmati Rice', 'Peanut Butter', 'Maple Syrup']),
      c('coffee-tea', 'Coffee & Tea', [6, 39], 'capacity', ['Whole Bean Coffee', 'Ground Coffee', 'Green Tea', 'Chai Tea']),
    ],
  },
  {
    slug: 'books', name: 'Books', taxable: true,
    description: 'Fiction, non-fiction, children’s books and cookbooks.',
    brands: ['Larkspur Press', 'Inkwell House', 'Tidewater Books'],
    categories: [
      c('fiction', 'Fiction', [9, 32], 'none', ['Novel', 'Mystery', 'Thriller', 'Fantasy Novel', 'Short Stories']),
      c('non-fiction', 'Non-fiction', [12, 40], 'none', ['Biography', 'History', 'Science Book', 'Essay Collection']),
      c('childrens-books', "Children's Books", [6, 24], 'none', ['Picture Book', 'Early Reader', 'Chapter Book']),
      c('cookbooks', 'Cookbooks', [14, 45], 'none', ['Baking Cookbook', 'Weeknight Cookbook', 'Vegetarian Cookbook']),
    ],
  },
];
