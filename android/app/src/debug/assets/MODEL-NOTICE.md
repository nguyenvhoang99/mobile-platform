# TensorFlow ADD smoke fixture

File: add.bin (544 bytes), SHA-256: 038f8d317c07b094e3b7d0c7aba60a3d9e441eb4188c8515920108b963c3873d
Source: https://github.com/tensorflow/tensorflow/blob/master/tensorflow/lite/testdata/add.bin (downloaded 2026-10-04; digest pins these exact bytes).
Copyright The TensorFlow Authors. Apache License 2.0: https://github.com/tensorflow/tensorflow/blob/master/LICENSE

Float32 input/output shape [1,8,8,3]. Two ADD operators compute y = (x + x) + x. Test fills input with 2 and checks all 192 outputs equal 6. A runtime error or output mismatch is failure; no synthetic success. Debug-only asset, not a bill extractor or trained product model. See LICENSE-TENSORFLOW.txt.
