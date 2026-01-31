<?php
namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(normalizationContext: ['groups' => ['prophy:read']])]
class ProphylaxisTask
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['prophy:read', 'speculation:read', 'flock:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'prophylaxisTasks')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Speculation $speculation = null;

    #[ORM\Column]
    #[Groups(['prophy:read', 'speculation:read', 'flock:read'])]
    private ?int $targetDay = null; // Ex: 7

    #[ORM\Column(length: 255)]
    #[Groups(['prophy:read', 'speculation:read', 'flock:read'])]
    private ?string $name = null; // Ex: "Gumboro I"

    #[ORM\Column(length: 50)]
    #[Groups(['prophy:read', 'speculation:read', 'flock:read'])]
    private ?string $type = 'VACCIN'; // VACCIN, VITAMINE...

    // Getters/Setters...

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSpeculation(): ?Speculation
    {
        return $this->speculation;
    }

    public function setSpeculation(?Speculation $speculation): self
    {
        $this->speculation = $speculation;

        return $this;
    }

    public function getTargetDay(): ?int
    {
        return $this->targetDay;
    }

    public function setTargetDay(int $targetDay): self
    {
        $this->targetDay = $targetDay;

        return $this;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): self
    {
        $this->name = $name;

        return $this;
    }

    public function getType(): ?string
    {
        return $this->type;
    }

    public function setType(string $type): self
    {
        $this->type = $type;

        return $this;
    }
}