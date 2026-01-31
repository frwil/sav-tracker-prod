<?php 
namespace App\Entity;

use App\Entity\Flock;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Put;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Delete;
use Doctrine\ORM\Mapping as ORM;
use Doctrine\ORM\Mapping\ManyToOne;
use Doctrine\ORM\Mapping\JoinColumn;
use ApiPlatform\Metadata\ApiResource;
use App\Repository\BuildingRepository;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\Common\Collections\ArrayCollection;
use Symfony\Component\Serializer\Attribute\Groups;
// src/Entity/Building.php
#[ORM\Entity(repositoryClass: BuildingRepository::class)]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post(security: "is_granted('ROLE_USER')"), // Tout le monde peut créer
        new Put(security: "is_granted('ROLE_USER')"),
        new Patch(security: "is_granted('ROLE_ADMIN') || is_granted('ROLE_SUPER_ADMIN')"), // Seul l'admin et le superadmin peuvent archiver (via PATCH)
        new Delete(security: "is_granted('ROLE_SUPER_ADMIN')") // Seul le superadmin peut supprimer
    ],
    normalizationContext: ['groups' => ['building:read']],
    denormalizationContext: ['groups' => ['building:write']]
)]
class Building
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['building:read', 'visit:read', 'flock:read','customer:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    #[Groups(['building:read', 'building:write', 'visit:read', 'flock:read','customer:read'])]
    private ?string $name = null;

    #[ORM\Column(type: 'float', nullable: true)]
    #[Groups(['visit:read', 'building:read', 'building:write', 'flock:read','customer:read'])]
    private ?float $surface = null;

    #[ORM\Column]
    #[Groups(['building:read', 'building:write', 'flock:read','customer:read'])]
    private ?int $maxCapacity = null;

    #[ORM\ManyToOne(inversedBy: 'buildings')]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['building:read', 'building:write', 'flock:read','customer:read'])]
    private ?Customer $customer = null;

    #[ORM\OneToMany(mappedBy: 'building', targetEntity: Flock::class)]
    #[Groups(['building:read', 'visit:read'])]
    private Collection $flocks;

    #[ORM\Column(options: ['default' => true])]
    #[Groups(['building:read', 'building:write', 'visit:read'])]
    private ?bool $activated = true;

    public function __construct()
    {
        $this->flocks = new ArrayCollection();
    }

    // Getters/Setters...
    public function getId(): ?int { return $this->id; }
    public function getName(): ?string { return $this->name; }
    public function setName(string $name): self { $this->name = $name; return $this; }
    public function getSurface(): ?float { return $this->surface; }
    public function setSurface(?float $surface): self { $this->surface = $surface; return $this; }
    public function getMaxCapacity(): ?int { return $this->maxCapacity; }
    public function setMaxCapacity(?int $maxCapacity): self { $this->maxCapacity = $maxCapacity; return $this; }
    public function getCustomer(): ?Customer { return $this->customer; }
    public function setCustomer(?Customer $customer): self { $this->customer = $customer; return $this; }
    public function isActivated(): ?bool { return $this->activated; }
    public function setActivated(bool $activated): self { $this->activated = $activated; return $this; }
    public function getFlocks(): Collection { return $this->flocks; }
    public function setFlocks(Collection $flocks): self { $this->flocks = $flocks; return $this; }
    public function addFlock(Flock $flock): self {
        if (!$this->flocks->contains($flock)) {
            $this->flocks->add($flock);
            $flock->setBuilding($this);
        }
        return $this;
    }
    public function removeFlock(Flock $flock): self {
        if ($this->flocks->removeElement($flock)) {
            // set the owning side to null (unless already changed)
            if ($flock->getBuilding() === $this) {
                $flock->setBuilding(null);
            }
        }
        return $this;
    }
    public function __toString(): string {
        return $this->name ?? '';
    }
}