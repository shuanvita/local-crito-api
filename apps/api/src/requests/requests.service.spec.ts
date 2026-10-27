import { BadRequestException } from '@nestjs/common';
import { normalizeFields, normalizeLabels } from './requests.service.js';

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

describe('normalizeLabels', () => {
  const fields = { name: 'Иван', city: 'Казань' };

  it('берёт строки для полей заявки, обрезает пробелы', () => {
    expect(normalizeLabels({ name: ' ФИО ', city: 'Город' }, fields)).toEqual({ name: 'ФИО', city: 'Город' });
  });

  it('отбрасывает подписи к чужим ключам, пустые и не строки, а не отвергает заявку', () => {
    expect(normalizeLabels({ name: 'ФИО', ghost: 'Чужое', city: '  ', other: 5 }, fields)).toEqual({ name: 'ФИО' });
  });

  it('нет подходящих подписей или неверная форма: undefined', () => {
    for (const bad of [undefined, null, 'x', ['a'], {}, { ghost: 'x' }, { name: 1 }]) {
      expect(normalizeLabels(bad, fields)).toBeUndefined();
    }
  });

  it('длинную подпись обрезает до лимита', () => {
    expect(normalizeLabels({ name: 'я'.repeat(600) }, fields)?.name).toHaveLength(500);
  });

  it('ключ __proto__ не меняет прототип и берётся только если есть среди полей', () => {
    const input = JSON.parse('{"__proto__": "x", "name": "a"}') as unknown;
    expect(normalizeLabels(input, fields)).toEqual({ name: 'a' });
    const withProto = normalizeLabels(input, JSON.parse('{"__proto__": "v"}') as Record<string, string>);
    expect(Object.getPrototypeOf(withProto)).toBe(Object.prototype);
  });
});
