# 简介
`vscode-ripgrep` 对应的预编译包，因`ripgrep `通过`github` 在国内下载有很大失败率，所以发布预编译包，并通过国内 cdn 下载。

# 注意
* 同版本号的 `vscode-ripgrep` 下载安装的 `ripgrep` 版本号必须一致

# 实现原理

1. 将 https://github.com/microsoft/ripgrep-prebuilt/releases 编译好的`ripgrep`文件下载到 `./build/` 目录
2. 在 `postinstall` 时下载对应平台的 `ripgrep` 并解压缩到 `./bin/` 目录
3. 通过 `rgPath` 拿到 `ripgrep` 即可执行
