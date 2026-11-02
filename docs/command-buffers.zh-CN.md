# 可配置的命令缓冲区

[en](command-buffers.md) · [fr](command-buffers.fr.md) · [de](command-buffers.de.md) · [es](command-buffers.es.md) · [zh-CN](command-buffers.zh-CN.md)

可通过有范围限制的环境变量调整命令输出缓冲区。溢出日志包含命令类别、代码位置和限制，不输出参数或捕获的内容。默认值和流式命令保持不变。

## 配置

在实际执行命令的每个 Enhanced 实例上设置这些变量。辅助容器继承经过验证的值。无效值会回退到默认值并记录警告，但不会记录传入的值。更改环境后重启或重建 Enhanced。这些设置不会改变超时、业务日志限制或流式传输。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DOCKGE_COMMAND_BUFFER_MULTIPLIER` | `1` | 现有限制的倍数（整数 1–16）；请谨慎增加：每个并发命令的内存占用会增加。 |
| `DOCKGE_COMMAND_BUFFER_MAX_MIB` | `256` | 每个命令的绝对上限，单位 MiB（整数 1–256）。 |

默认倍数为 1，上限为 256 MiB。实际限制 = min(现有限制 × 倍数，上限)。原生命令通常为 1 MiB；promisify-child-process 捕获输出默认为 200 KiB；卷检查使用 4 MiB，并继续分小批次仅读取必要字段。Node 分别限制每个输出流；promisify-child-process 合计 stdout 和 stderr。

```yaml
environment:
  DOCKGE_COMMAND_BUFFER_MULTIPLIER: "2"
  DOCKGE_COMMAND_BUFFER_MAX_MIB: "256"
```

## 诊断

maxBuffer 或 ENOBUFS 错误会生成一条 [commandBuffer] 日志，包含文件/行号、安全的命令类别及原始和实际字节上限。此诊断不会添加参数、环境值、绝对路径或捕获的输出。原始错误继续向上传递；其他错误不会重新分类。提高上限需要更多内存，不能替代有界查询。
