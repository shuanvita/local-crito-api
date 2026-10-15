import { BadRequestException } from '@nestjs/common';
import { normalizeFields } from './requests.service.js';

describe('normalizeFields', () => {
  it('обрезает пробелы у строк и в списках', () => {
    expect(normalizeFields({ name: '  Иван ', tags: [' a ', 'b'] })).toEqual({ name: 'Иван', tags: ['a', 'b'] });
  });

  it('отвергает не объект, пустой объект и не строки', () => {
    for (const bad of [null, 'x', [], {}, { a: 1 }, { a: null }, { a: { b: 'c' } }, { a: [1] }, { a: [['x']] }]) {
      expect(() => normalizeFields(bad)).toThrow(BadRequestException);
    }
  });

  it('держит лимиты: число полей, длина ключа, значения и общий размер', () => {
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`f${i}`, 'x']));
    expect(() => normalizeFields(many)).toThrow(BadRequestException);
    expect(() => normalizeFields({ ['k'.repeat(65)]: 'x' })).toThrow(BadRequestException);
    expect(() => normalizeFields({ a: 'x'.repeat(5001) })).toThrow(BadRequestException);
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, 'x'.repeat(4000)]));
    expect(() => normalizeFields(big)).toThrow(BadRequestException);
  });

  it('ключ __proto__ остаётся обычным полем и не меняет прототип', () => {
    const input = JSON.parse('{"__proto__": "x", "name": "a"}') as unknown;
    const result = normalizeFields(input);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.keys(result)).toEqual(['__proto__', 'name']);
  });
});
