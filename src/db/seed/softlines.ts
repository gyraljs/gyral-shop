import { c, type DepartmentSpec } from './spec.js';

// prettier-ignore
export const SOFTLINES: readonly DepartmentSpec[] = [
  {
    slug: 'clothing', name: 'Clothing', taxable: true,
    description: 'Everyday clothing and shoes for the whole family.',
    brands: ['Fieldstone', 'Mara Lane', 'Little Sprout', 'Stride'],
    categories: [
      c('mens-tops', "Men's Tops", [12, 89], 'apparel', ['Crew Tee', 'Oxford Shirt', 'Polo', 'Hoodie', 'Flannel Shirt']),
      c('womens-dresses', "Women's Dresses", [24, 149], 'apparel', ['Wrap Dress', 'Midi Dress', 'Shirt Dress', 'Maxi Dress']),
      c('kids-clothing', "Kids' Clothing", [8, 49], 'apparel', ['Graphic Tee', 'Joggers', 'Pajama Set', 'Rain Jacket']),
      c('shoes', 'Shoes', [29, 179], 'shoes', ['Running Shoe', 'Sneaker', 'Hiking Boot', 'Loafer', 'Sandal']),
      c('outerwear', 'Outerwear', [49, 299], 'apparel', ['Puffer Jacket', 'Rain Shell', 'Fleece Jacket', 'Wool Coat']),
    ],
  },
  {
    slug: 'beauty', name: 'Beauty', taxable: true,
    description: 'Skincare, makeup, hair care and fragrance.',
    brands: ['Lumiere', 'Pure Petal', 'Velvet & Co'],
    categories: [
      c('skincare', 'Skincare', [8, 89], 'capacity', ['Moisturizer', 'Cleanser', 'Vitamin C Serum', 'Sunscreen SPF 50']),
      c('makeup', 'Makeup', [6, 59], 'color', ['Lipstick', 'Mascara', 'Foundation', 'Eyeshadow Palette']),
      c('hair-care', 'Hair Care', [6, 199], 'none', ['Shampoo', 'Conditioner', 'Hair Dryer', 'Curling Iron']),
      c('fragrance', 'Fragrance', [24, 149], 'capacity', ['Eau de Parfum', 'Cologne', 'Body Mist']),
    ],
  },
];
