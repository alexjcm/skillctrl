# Assertions Guide for Java 8 + JUnit 4

Use this guide to keep assertions readable, maintainable, and aligned with common static-analysis expectations.

## Preferred Pattern: Group Assertions by Subject

Prefer chaining assertions on the same object:

```java
assertThat(order)
    .isNotNull()
    .extracting(Order::getStatus, Order::getCurrency)
    .containsExactly("CREATED", "USD");
```

This usually reads better than multiple disconnected assertions over the same variable.

## Sonar-Friendly Patterns

### 1) Keep related checks together

```java
assertThat(result)
    .isNotNull()
    .extracting(Result::getCode, Result::getMessage)
    .containsExactly("OK", "done");
```

### 2) Prefer semantic collection assertions

```java
assertThat(items)
    .hasSize(2)
    .containsExactly(itemA, itemB);
```

### 3) Exception assertions

```java
assertThatThrownBy(() -> service.process(null))
    .isInstanceOf(IllegalArgumentException.class)
    .hasMessageContaining("input");
```

## When Repository Convention Differs

If the project already standardizes on another style:
- keep consistency with existing tests
- avoid introducing mixed assertion styles in the same test class
- prioritize repository conventions over this guide

## Anti-Patterns to Avoid

- Mixing many assertion libraries in one test class without a reason.
- Over-fragmented assertions for the same subject when a single chain is clearer.
- Asserting implementation details that do not matter for behavior.
