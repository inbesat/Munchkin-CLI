# Homebrew formula for the forge CLI (Phase 150).
#
# Try locally:  brew install --formula ./packaging/homebrew/forge.rb
# Publish:      copy this file into a tap repo (`homebrew-<name>`) as
#               Formula/forge.rb, or submit to homebrew-core later.
#
# After each release, update `version` and every `sha256` below with the
# values printed by the release workflow's checksums.txt artifact (see
# packaging/README.md).
class Forge < Formula
  desc "Open-source CLI coding agent with a plugin-everything architecture"
  homepage "https://github.com/inbesat/Munchkin-CLI"
  version "0.1.0"

  on_macos do
    on_arm do
      url "https://github.com/inbesat/Munchkin-CLI/releases/download/v0.1.0/forge-darwin-arm64"
      sha256 "TODO_RELEASE_SHA256"
    end
    on_intel do
      url "https://github.com/inbesat/Munchkin-CLI/releases/download/v0.1.0/forge-darwin-x64"
      sha256 "TODO_RELEASE_SHA256"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/inbesat/Munchkin-CLI/releases/download/v0.1.0/forge-linux-arm64"
      sha256 "TODO_RELEASE_SHA256"
    end
    on_intel do
      url "https://github.com/inbesat/Munchkin-CLI/releases/download/v0.1.0/forge-linux-x64"
      sha256 "TODO_RELEASE_SHA256"
    end
  end

  def install
    bin.install Dir["*"].first => "forge"
    chmod 0755, bin/"forge"
  end

  test do
    assert_match "forge #{version}", shell_output("#{bin}/forge version")
  end
end
