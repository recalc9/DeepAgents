import { describe, it, expect } from "vitest";
import { queryJson, formatError } from "../../core/agent-helpers.js";

describe("queryJson", () => {
  it("顶层属性查询", () => {
    expect(queryJson({ name: "Alice" }, "$.name")).toBe("Alice");
  });

  it("嵌套对象查询", () => {
    const obj = { user: { profile: { age: 30 } } };
    expect(queryJson(obj, "$.user.profile.age")).toBe(30);
  });

  it("数组索引查询", () => {
    expect(queryJson({ items: ["a", "b", "c"] }, "$.items[1]")).toBe("b");
  });

  it("深层数组对象查询", () => {
    const obj = { users: [{ name: "Alice" }, { name: "Bob" }] };
    expect(queryJson(obj, "$.users[0].name")).toBe("Alice");
  });

  it("路径不存在返回 undefined", () => {
    expect(queryJson({ a: 1 }, "$.b")).toBeUndefined();
  });

  it("null 对象的路径查询", () => {
    expect(queryJson(null, "$.anything")).toBeUndefined();
  });

  it("无 $ 前缀也能工作", () => {
    expect(queryJson({ x: { y: 1 } }, "x.y")).toBe(1);
  });
});

describe("formatError", () => {
  it("Error 实例", () => expect(formatError(new Error("test"))).toBe("test"));
  it("字符串", () => expect(formatError("msg")).toBe("msg"));
  it("数字", () => expect(formatError(404)).toBe("404"));
});
